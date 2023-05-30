import { JsonRpcProvider, RawSigner, SuiTransactionBlockResponse } from '@mysten/sui.js'

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
    profiles: string[]
    provider: JsonRpcProvider
    signer: RawSigner
    // env
    dappPackages: string[]
    recentPosts: string
    adminCap: string
}

export type ShareContext = Omit<AppContext, 'publicKey' | 'profiles'>
export type RequestContext = Omit<AppContext, 'provider' | 'signer'>

export interface TaskRequest {
    data:
        | {
              action: 'createPost'
              payload: { profile: string; content: string; imageUrl: string }
          }
        | {
              action: 'createComment'
              payload: { profile: string; content: string; post: string }
          }
        | {
              action: 'likePost'
              payload: { profile: string; post: string }
          }
        | {
              action: 'unlikePost'
              payload: { profile: string; post: string }
          }
        | {
              action: 'followProfile'
              payload: { profile: string; followingProfile: string }
          }
        | {
              action: 'unfollowProfile'
              payload: { profile: string; followingProfile: string }
          }
}

export interface TaskResponse {
    digest: SuiTransactionBlockResponse['digest']
    effects: SuiTransactionBlockResponse['effects']
    events: SuiTransactionBlockResponse['events']
}

export interface Flags {
    locked: boolean
    lastRequest: string | null
    lastProcessedRequests: string[] | null
}
