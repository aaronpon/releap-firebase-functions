import { JsonRpcProvider, RawSigner, SuiTransactionBlockResponse } from '@mysten/sui.js'
import { Timestamp } from 'firebase-admin/firestore'
import z from 'zod'
import { CreateCampaginInput, QuestSubmissionInput } from './inputType'

// DB Schema ====================================================
/*
 * Events schema
 * -----------
 * type: 'comment' | 'follow' | 'like'
 * profileId: profile to be notify
 * sender: sender
 * post: parent
 * postId: comment
 */
export const Event = z.object({
    type: z.enum(['comment', 'follow', 'like'] as const),
    profileId: z.string(),
    sender: z.string(),
    post: z.string().optional().nullable(),
    postId: z.string().optional().nullable(),
    timeStamp: z.instanceof(Timestamp),
})

export const Post = z.object({
    postId: z.string(),
    profileId: z.string(),
    timeStamp: z.instanceof(Timestamp),
})

export const Comment = z.object({
    postId: z.string(),
    parentId: z.string(),
    profileId: z.string(),
    timeStamp: z.instanceof(Timestamp),
})

export const Badge = z.object({
    badgeId: z.string(),
    minter: z.string(),
    minterProfile: z.string().optional(),
    timeStamp: z.instanceof(Timestamp),
})

export const Point = z.object({
    badgeId: z.string(),
    minter: z.string(),
    campaignProfile: z.string(),
    point: z.number(),
    timeStamp: z.instanceof(Timestamp),
})

export const Campaign = CreateCampaginInput.extend({
    timeStamp: z.instanceof(Timestamp),
    manualQuests: z
        .object({
            id: z.string(),
            type: z.enum(['url', 'image', 'text'] as const),
            description: z.string(),
            name: z.string(),
        })
        .array()
        .optional(),
})

export const ProfileQuest = z.object({
    like: z.boolean(),
    follow: z.boolean(),
    reply: z.boolean(),
    retweet: z.boolean(),
})

export const QuestSubmission = QuestSubmissionInput.extend({
    wallet: z.string(),
    profileId: z.string(),
    owner: z.string().optional(),
    status: z.enum(['pending', 'approved', 'rejected'] as const),
    createdAt: z.instanceof(Timestamp),
    updatedAt: z.instanceof(Timestamp).optional(),
})

export const Profile = z.object({
    name: z.string(),
    profileId: z.string(),
    isEVM: z.boolean(),
    twitterId: z.string().optional().nullable(),
    twitterHandle: z.string().optional().nullable(),
    chainId: z.string().optional().nullable(),
    discordId: z.string().optional().nullable(),
    discordHandle: z.string().optional().nullable(),
})

export type IProfile = z.infer<typeof Profile>
export type IQuestSubmission = z.infer<typeof QuestSubmission>
export type ICampaign = z.infer<typeof Campaign>
export type IPoint = z.infer<typeof Point>
export type IBadge = z.infer<typeof Badge>
export type IComment = z.infer<typeof Comment>
export type IEvent = z.infer<typeof Event>
export type IPost = z.infer<typeof Post>
export type IProfileQuest = z.infer<typeof ProfileQuest>

//========================================================================

export interface LoginChallengeToken {
    attemptPublicKey: string
    signData: string
}

export interface LoginChallengeTokenEth {
    attemptPublicKey: string
    statement: string
    nonce: string
}

export interface TokenPayload {
    publicKey: string
    role: 'admin' | 'user'
    profiles: string[]
    isEth: boolean
}

export interface AppContext {
    publicKey: string
    profiles: string[]
    role: 'admin' | 'user'
    isEth: boolean
    provider: JsonRpcProvider
    adminPublicKey: string
    signer: RawSigner
    // env
    dappPackages: string[]
    recentPosts: string
    index: string
    profileTable: string
    adminCap: string
}

export type ShareContext = Omit<AppContext, 'publicKey' | 'profiles' | 'isEth' | 'role'>
export type RequestContext = Omit<AppContext, 'signer'>

export interface TaskRequest {
    data:
        | { action: 'createProfile'; payload: { profileName: string } }
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
        | {
              action: 'updateProfileDescription'
              payload: { profile: string; description: string; profileOwnerCap: string }
          }
        | { action: 'updateProfileImage'; payload: { profile: string; imageUrl: string; profileOwnerCap: string } }
        | { action: 'updateProfileCover'; payload: { profile: string; coverUrl: string; profileOwnerCap: string } }
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

export interface User {
    isEVM: boolean
    lastActivity: Timestamp
    name: string
    profileId: string
}

export interface DiscordServer {
    serverId: string
    ownerProfile: string
}
