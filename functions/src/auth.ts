import { randomBytes } from 'crypto'
import * as jsonwebtoken from 'jsonwebtoken'
import { Request } from 'firebase-functions/v2/https'
import { Response } from 'express'
import { Connection, fromSerializedSignature, IntentScope, JsonRpcProvider, verifyMessage } from '@mysten/sui.js'
import { LoginChallengeToken, LoginChallengeTokenEth, RequestContext, TokenPayload } from './types'
import { getAllOwnedObjects, RPC } from './utils'
import { SiweMessage } from 'siwe'
import { getFirstProfileName } from './ethereum'
import { isProfileEVMOnly } from './firestore'

const signMessage = [`Sign in to Releap.`, `This action will authenticate your wallet and enable to access the Releap.`]

const adminWallet = ['0xf0da02c49b96f5ab2cf7529cdcb66161581b92b28c421c11692e097c26315151']

export function applyJwtValidation(handler: (ctx: RequestContext, req: Request, res: Response) => Promise<void>) {
    return async (req: Request, res: Response) => {
        if (req.method !== 'POST') {
            res.status(403).send('Forbidden').end()
            return
        }

        const jwt = req.headers['authorization']
        if (jwt == null) {
            res.status(400).send('Missing authorization header').end()
            return
        }

        let publicKey
        let profiles
        let role
        let isEth = false
        try {
            const tokenPayload: TokenPayload = verfiyJwt(jwt, process.env.JWT_SECRET as string)
            if (tokenPayload.publicKey == null) {
                res.status(400).send('Invalid JWT').end()
                return
            }
            publicKey = tokenPayload.publicKey
            profiles = tokenPayload.profiles
            isEth = tokenPayload.isEth
            role = tokenPayload.role
        } catch (err) {
            res.status(400).send('Invaild JWT').end()
            return
        }
        let ctx: RequestContext
        try {
            ctx = {
                publicKey,
                profiles,
                isEth,
                role,
                dappPackages: process.env.DAPP_PACKAGES?.split(',') ?? [],
                recentPosts: process.env.RECENT_POSTS as string,
                adminCap: process.env.ADMIN_CAP as string,
                index: process.env.INDEX as string,
                profileTable: process.env.PROFILE_TABLE as string,
                provider: new JsonRpcProvider(new Connection({ fullnode: RPC })),
            }
        } catch (err) {
            res.status(500).send('Fail to create AppContext').end()
            return
        }

        await handler(ctx, req, res)
    }
}

export function verfiyJwt(jwt: string, secret: string) {
    const token = jwt.replace(/^Bearer /, '')
    return jsonwebtoken.verify(token, secret, {
        ignoreExpiration: false,
    }) as TokenPayload
}

export const requestLoginChallenge = (req: Request, res: Response) => {
    if (req.method !== 'POST') {
        res.status(403).send('Forbidden').end()
        return
    }

    const publicKey: string = req.body.data.publicKey
    if (publicKey == null) {
        res.status(400).send('Missing publicKey').end()
        return
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

    res.status(200).json({
        jwt,
        signData,
    })
}

export const submitLoginChallenge = async (req: Request, res: Response) => {
    if (req.method !== 'POST') {
        res.status(403).send('Forbidden').end()
        return
    }
    const reqJwt = req.headers['authorization']
    const signature = req.body.data.signature

    if (reqJwt == null) {
        res.status(400).send('Missing authorization header').end()
        return
    }

    if (signature == null) {
        res.status(400).send('Missing singature').end()
        return
    }

    const token = reqJwt.replace(/^Bearer /, '')
    const decoded = jsonwebtoken.verify(token, process.env.JWT_SECRET as string, {
        ignoreExpiration: false,
    }) as LoginChallengeToken

    const { attemptPublicKey: publicKey, signData } = decoded

    const { pubKey } = fromSerializedSignature(signature)

    if (pubKey.toSuiAddress() !== publicKey) {
        res.status(400).send('Invalid Sui Address').end()
        return
    }

    const verifyResult = verifyMessage(signData, signature, IntentScope.PersonalMessage)

    if (!verifyResult) {
        res.status(400).send('Invalid signature').end()
        return
    }

    const jwt = await genJWT(publicKey, { isEth: false })

    res.status(200).json({ jwt, publicKey })
}

export const extendToken = async (req: Request, res: Response) => {
    if (req.method !== 'POST') {
        res.status(403).send('Forbidden').end()
        return
    }
    const reqJwt = req.headers['authorization']

    if (reqJwt == null) {
        res.status(400).send('Missing authorization header').end()
        return
    }

    const token = reqJwt.replace(/^Bearer /, '')

    const { publicKey, isEth } = jsonwebtoken.verify(token, process.env.JWT_SECRET as string, {
        ignoreExpiration: false,
    }) as TokenPayload

    if (publicKey == null) {
        res.status(400).send('Invalid signature').end()
        return
    }

    const jwt = await genJWT(publicKey, { isEth: isEth ?? false })

    res.status(200).json({ jwt, publicKey })
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
            const isEVMProfile = await isProfileEVMOnly(profileName)

            if (isEVMProfile) {
                const df = await provider.getDynamicFieldObject({
                    parentId: process.env.PROFILE_TABLE as string,
                    name: { type: '0x1::string::String', value: profileName },
                })
                const profile = df.data?.content?.dataType === 'moveObject' && df.data.content.fields.value
                profiles.push(profile)
            }
        }
    }

    const payload: TokenPayload = {
        publicKey,
        profiles,
        isEth: options.isEth,
        role: adminWallet.includes(publicKey) ? 'admin' : 'user',
    }

    return jsonwebtoken.sign(payload, process.env.JWT_SECRET as string, {
        expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
    })
}

export const requestEthLoginChallenge = (req: Request, res: Response) => {
    if (req.method !== 'POST') {
        res.status(403).send('Forbidden').end()
        return
    }

    const publicKey: string = req.body.data.publicKey
    if (publicKey == null) {
        res.status(400).send('Missing publicKey').end()
        return
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

    res.status(200).json({
        jwt,
        statement,
        nonce,
    })
}

export const submitEthLoginChallenge = async (req: Request, res: Response) => {
    if (req.method !== 'POST') {
        res.status(403).send('Forbidden').end()
        return
    }
    const reqJwt = req.headers['authorization']
    const { signature, uri, domain, version, chainId, issuedAt } = req.body.data

    if (reqJwt == null) {
        res.status(400).send('Missing authorization header').end()
        return
    }

    if (signature == null) {
        res.status(400).send('Missing signature').end()
        return
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
        res.status(400).send('Invalid singature').end()
        return
    }

    const jwt = await genJWT(publicKey, { isEth: true })

    res.status(200).json({ jwt, publicKey })
}
