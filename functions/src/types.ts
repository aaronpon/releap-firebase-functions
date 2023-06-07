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

export interface ApifyTwitterRes {
    MeasureDate: string | number | Date
    username: string
    user_id: string
    id: string
    conversation_id: string
    full_text: string
    reply_count: number
    retweet_count: number
    favorite_count: number
    hashtags: string[]
    symbols: string[]
    user_mentions: UserMention[]
    urls: string[]
    media: Media[]
    url: string
    created_at: string
    '#sort_index': string
    view_count: number
    quote_count: number
    is_quote_tweet: boolean
    is_retweet: boolean
    is_truncated: boolean
    is_thread: boolean
    is_root_thread: boolean
    startUrl: string
}

export interface UserMention {
    id_str: string
    name: string
    screen_name: string
    profile: string
}

export interface Media {
    media_url: string
    type: string
    video_url: string
}
