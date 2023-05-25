import { randomBytes } from 'crypto'
import * as jsonwebtoken from 'jsonwebtoken'
import { Request } from 'firebase-functions/v2/https'
import { Response } from 'express'
import * as logger from 'firebase-functions/logger'
import { fromSerializedSignature, IntentScope, JsonRpcProvider, mainnetConnection, verifyMessage } from '@mysten/sui.js'
import { LoginChallengeToken, TokenPayload } from './types'
import { getAllOwnedObjects } from './utils'

const signMessage = [
    `Sign in to Releap.`,
    `This action will authenticate your wallet and enable to access the Releap.`,
    `Nonce:`,
]

export function verfiyJwt(jwt: string, secret: string) {
    return jsonwebtoken.verify(jwt, secret, {
        ignoreExpiration: false,
    }) as TokenPayload
}

export const requestLoginChallenge = (req: Request, res: Response) => {
    logger.info('test', { structuredData: true })
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

    const decoded = jsonwebtoken.verify(reqJwt, process.env.JWT_SECRET as string, {
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

    const provider = new JsonRpcProvider(mainnetConnection)
    const dappPackages = process.env.DAPP_PACKAGES?.split(',') ?? []

    const profiles = (await getAllOwnedObjects(provider, publicKey))
        .filter(
            (it) =>
                dappPackages.some((dappPackage) => it.data?.type?.startsWith(dappPackage)) &&
                it.data?.type?.endsWith('ProfileOwnerCap'),
        )
        .map((it) => it.data?.content?.dataType === 'moveObject' && it.data?.content.fields.profile)

    const payload: TokenPayload = {
        publicKey,
        profiles,
    }

    const jwt = jsonwebtoken.sign(payload, process.env.JWT_SECRET as string, {
        expiresIn: process.env.JWT_EXPIRES_IN ?? '24h',
    })
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

    const { publicKey } = jsonwebtoken.verify(reqJwt, process.env.JWT_SECRET as string, {
        ignoreExpiration: false,
    }) as TokenPayload

    if (publicKey == null) {
        res.status(400).send('Invalid signature').end()
        return
    }

    const provider = new JsonRpcProvider(mainnetConnection)
    const dappPackages = process.env.DAPP_PACKAGES?.split(',') ?? []

    const profiles = (await getAllOwnedObjects(provider, publicKey))
        .filter(
            (it) =>
                dappPackages.some((dappPackage) => it.data?.type?.startsWith(dappPackage)) &&
                it.data?.type?.endsWith('ProfileOwnerCap'),
        )
        .map((it) => it.data?.content?.dataType === 'moveObject' && it.data?.content.fields.profile)

    const payload: TokenPayload = {
        publicKey,
        profiles,
    }

    const jwt = jsonwebtoken.sign(payload, process.env.JWT_SECRET as string, {
        expiresIn: process.env.JWT_EXPIRES_IN ?? '24h',
    })
    res.status(200).json({ jwt, publicKey })
}
