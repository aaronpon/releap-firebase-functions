import { randomBytes } from 'crypto'
import * as jsonwebtoken from 'jsonwebtoken'
import { Response, Request } from 'express'
import { Connection, IntentScope, JsonRpcProvider, verifyMessage, toSingleSignaturePubkeyPair } from '@mysten/sui.js'
import {
    IProfile,
    IWallet,
    LoginChallengeToken,
    LoginChallengeTokenEth,
    RequestContext,
    RequestEthLoginChallenge,
    RequestLoginChallenge,
    SubmitEthLoginChallenge,
    SubmitLoginChallenge,
    TaskRequest,
    TokenPayload,
} from './types'
import { getAllOwnedObjects, RPC, sleep } from './utils'
import { SiweMessage } from 'siwe'
import { getFirstProfileName } from './ethereum'
import { isProfileEVMOnly, storeDoc } from './firestore'
import admin from 'firebase-admin'
import { getVeReapAmount } from './governance/utils'
import { BadRequest, ServerError, errorHandler } from './error'
import { z } from 'zod'

const signMessage = [`Sign in to Releap.`, `This action will authenticate your wallet and enable to access the Releap.`]

export function getRequestContext(req: Request): RequestContext {
    const jwt = req.headers['authorization']
    if (jwt == null) {
        throw new BadRequest('Missing authorization header')
    }

    let publicKey
    let profiles
    let isEth = false
    try {
        const tokenPayload: TokenPayload = verfiyJwt(jwt, process.env.JWT_SECRET as string)
        if (tokenPayload.publicKey == null) {
            throw new BadRequest('Invalid JWT')
        }
        publicKey = tokenPayload.publicKey
        profiles = tokenPayload.profiles
        isEth = tokenPayload.isEth
    } catch (err) {
        throw new BadRequest('Invalid JWT')
    }

    try {
        return {
            publicKey,
            profiles,
            isEth,
            dappPackages: process.env.DAPP_PACKAGES?.split(',') ?? [],
            recentPosts: process.env.RECENT_POSTS as string,
            adminCap: process.env.ADMIN_CAP as string,
            adminPublicKey: process.env.ADMIN_PUBLICKEY as string,
            index: process.env.INDEX as string,
            profileTable: process.env.PROFILE_TABLE as string,
            provider: new JsonRpcProvider(new Connection({ fullnode: RPC })),
        }
    } catch (err) {
        throw new ServerError('Fail to create AppContext')
    }
}

export function applyJwtValidation(handler: (ctx: RequestContext, req: Request, res: Response) => Promise<void>) {
    return async (req: Request, res: Response) => {
        try {
            const ctx = getRequestContext(req)
            if (ctx == null) {
                return
            }
            await handler(ctx, req, res)
        } catch (err) {
            errorHandler(err, res)
        }
    }
}

export function verfiyJwt(jwt: string, secret: string) {
    const token = jwt.replace(/^Bearer /, '')
    return jsonwebtoken.verify(token, secret, {
        ignoreExpiration: false,
    }) as TokenPayload
}

export function requestLoginChallenge(data: z.infer<typeof RequestLoginChallenge>['data']) {
    const publicKey: string = data.publicKey
    if (publicKey == null) {
        throw new BadRequest('Missing publicKey')
    }
    const nonce = randomBytes(8).toString('hex')
    const signData = `${signMessage.join('\r\n')} ${nonce}`

    const payload: LoginChallengeToken = {
        attemptPublicKey: publicKey,
        signData,
    }

    const jwt = jsonwebtoken.sign(payload, process.env.JWT_SECRET as string, {
        expiresIn: '120s',
    })

    return {
        jwt,
        signData,
    }
}

export async function submitLoginChallenge(req: Request, data: z.infer<typeof SubmitLoginChallenge>['data']) {
    const reqJwt = req.headers['authorization']
    const signature = data.signature

    if (reqJwt == null) {
        throw new BadRequest('Missing authorization header')
    }

    if (signature == null) {
        throw new BadRequest('Missing signature')
    }

    const token = reqJwt.replace(/^Bearer /, '')
    const decoded = jsonwebtoken.verify(token, process.env.JWT_SECRET as string, {
        ignoreExpiration: false,
    }) as LoginChallengeToken

    const { attemptPublicKey: publicKey, signData } = decoded

    const { pubKey } = toSingleSignaturePubkeyPair(signature)

    if (pubKey.toSuiAddress() !== publicKey) {
        throw new BadRequest('Invalid Sui Address')
    }

    const verifyResult = verifyMessage(signData, signature, IntentScope.PersonalMessage)

    if (!verifyResult) {
        throw new BadRequest('Invalid signature')
    }

    await storeDoc<IWallet>('wallets', publicKey, {
        address: publicKey,
        veReap: await getVeReapAmount('sui', publicKey),
    })

    const jwt = await genJWT(publicKey, { isEth: false })

    return { jwt, publicKey }
}

export const extendToken = async (ctx: RequestContext) => {
    const jwt = await genJWT(ctx.publicKey, { isEth: ctx.isEth ?? false })
    return { jwt, publicKey: ctx.publicKey }
}

async function genJWT(publicKey: string, options: { isEth: boolean }): Promise<string> {
    const provider = new JsonRpcProvider(new Connection({ fullnode: RPC }))
    const dappPackages = process.env.DAPP_PACKAGES?.split(',') ?? []

    let profiles = []
    if (!options.isEth) {
        profiles = (await getAllOwnedObjects(provider, publicKey))
            .filter(
                (it) =>
                    dappPackages.some((dappPackage) => it.data?.type?.startsWith(dappPackage)) &&
                    it.data?.type?.endsWith('ProfileOwnerCap'),
            )
            .map((it) => it.data?.content?.dataType === 'moveObject' && it.data?.content.fields.profile)
    }

    if (options.isEth) {
        const profileName: string | null = await getFirstProfileName(publicKey)

        if (profileName) {
            try {
                const isEVMProfile = await isProfileEVMOnly(profileName)

                if (isEVMProfile) {
                    const df = await provider.getDynamicFieldObject({
                        parentId: process.env.PROFILE_TABLE as string,
                        name: { type: '0x1::string::String', value: profileName },
                    })
                    const profile = df.data?.content?.dataType === 'moveObject' && df.data.content.fields.value
                    profiles.push(profile)
                }
            } catch (e) {
                // If firebase does not have evm profile, we should create it for the user
                console.log(e)

                const df = await provider.getDynamicFieldObject({
                    parentId: process.env.PROFILE_TABLE as string,
                    name: { type: '0x1::string::String', value: profileName },
                })
                const profileId = (df.data?.content?.dataType === 'moveObject' && df.data.content.fields.value) ?? ''

                if (profileId) {
                    profiles.push(profileId)
                    await storeDoc<IProfile>('users', profileId, {
                        name: profileName,
                        profileId: profileId,
                        isEVM: true,
                        chainId: '324',
                    })
                } else {
                    const task: TaskRequest = {
                        data: {
                            action: 'createProfile',
                            payload: { profileName },
                        },
                    }
                    await admin.database().ref('/tasks').push(task)
                    let shouldWait = true
                    let waitedCount = 0

                    while (shouldWait) {
                        await sleep(waitedCount * 2000)
                        const df = await provider.getDynamicFieldObject({
                            parentId: process.env.NEXT_PUBLIC_RELEAP_PROFILE_INDEX_TABLE_ADDRESS ?? '',
                            name: { type: '0x1::string::String', value: profileName },
                        })
                        const profile = df.data?.content?.dataType === 'moveObject' && df.data.content.fields.value
                        console.log('Found profile: ', profile)
                        profiles.push(profileId)
                        if (waitedCount > 10) {
                            shouldWait = false
                        } else if (profile) {
                            await storeDoc<IProfile>('users', profileId, {
                                name: profileName,
                                profileId: profileId,
                                isEVM: true,
                                chainId: '324',
                            })
                            shouldWait = false
                        }
                        waitedCount++
                    }
                }
            }
        }
    }

    const payload: TokenPayload = {
        publicKey,
        profiles,
        isEth: options.isEth,
    }

    return jsonwebtoken.sign(payload, process.env.JWT_SECRET as string, {
        expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
    })
}

export function requestEthLoginChallenge(data: z.infer<typeof RequestEthLoginChallenge>['data']) {
    const publicKey: string = data.publicKey
    if (publicKey == null) {
        throw new BadRequest('Missing publicKey')
    }
    const nonce = randomBytes(8).toString('hex')
    const statement = signMessage.join(' ')
    const payload: LoginChallengeTokenEth = {
        attemptPublicKey: publicKey,
        nonce,
        statement,
    }

    const jwt = jsonwebtoken.sign(payload, process.env.JWT_SECRET as string, {
        expiresIn: '120s',
    })

    return {
        jwt,
        statement,
        nonce,
    }
}

export const submitEthLoginChallenge = async (req: Request, data: z.infer<typeof SubmitEthLoginChallenge>['data']) => {
    const reqJwt = req.headers['authorization']
    const { signature, uri, domain, version, chainId, issuedAt } = data

    if (reqJwt == null) {
        throw new BadRequest('Missing authorization header')
    }

    if (signature == null) {
        throw new BadRequest('Missing signature')
    }

    const token = reqJwt.replace(/^Bearer /, '')
    const decoded = jsonwebtoken.verify(token, process.env.JWT_SECRET as string, {
        ignoreExpiration: false,
    }) as LoginChallengeTokenEth

    const { attemptPublicKey: publicKey, nonce, statement } = decoded

    const siweMessage = new SiweMessage({
        nonce,
        address: publicKey,
        statement,
        uri,
        domain,
        version,
        chainId,
        issuedAt,
    })

    const { success } = await siweMessage.verify({ signature })

    if (!success) {
        throw new BadRequest('Invalid signature')
    }

    const jwt = await genJWT(publicKey, { isEth: true })

    return { jwt, publicKey }
}
