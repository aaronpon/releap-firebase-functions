import { JsonRpcProvider, RawSigner } from '@mysten/sui.js'

export interface LoginChallengeToken {
    attemptPublicKey: string
    signData: string
}

export interface TokenPayload {
    publicKey: string
    profiles: string[]
}

export interface AppContext {
    publicKey: string
    profiles: string
    provider: JsonRpcProvider
    signer: RawSigner
    // env
    dappPackages: string[]
    recentPosts: string
    adminCap: string
}
