import { JsonRpcProvider, RawSigner, SuiTransactionBlockResponse } from '@mysten/sui.js'
import { Timestamp, WhereFilterOp } from 'firebase-admin/firestore'
import z from 'zod'
import { ApproveQuestInput, CreateCampaginInput, QuestSubmissionInput, VerifyDiscordServerInput } from './inputType'
import { CurationList } from './curation/types'

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
    activeWallet: z.string().optional().nullable(),
    curationList: CurationList.optional().nullable(),
    profileTokenType: z.string().optional().nullable(),
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
    profiles: string[]
    isEth: boolean
    isAdmin: boolean
}

export interface AppContext {
    publicKey: string
    profiles: string[]
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
    isAdmin: boolean
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

export const RequestLoginChallenge = z.object({
    action: z.literal('requestLoginChallenge'),
    data: z.object({
        publicKey: z.string(),
    }),
})

export const RequestEthLoginChallenge = z.object({
    action: z.literal('requestEthLoginChallenge'),
    data: z.object({
        publicKey: z.string(),
    }),
})

export const SubmitLoginChallenge = z.object({
    action: z.literal('submitLoginChallenge'),
    data: z.object({
        signature: z.string(),
    }),
})

export const SubmitEthLoginChallenge = z.object({
    action: z.literal('submitEthLoginChallenge'),
    data: z.object({
        signature: z.string(),
        uri: z.string(),
        domain: z.string(),
        version: z.string(),
        chainId: z.number(),
        issuedAt: z.string(),
    }),
})

export const ExtendToken = z.object({
    action: z.literal('extendToken'),
    data: z.object({}),
})

export const CreateProfile = z.object({
    action: z.literal('createProfile'),
    data: z.object({
        profileName: z.string(),
    }),
})

export const CreatePost = z.object({
    action: z.literal('createPost'),
    data: z.object({
        profile: z.string(),
        imageUrl: z.string().optional(),
        content: z.string().optional(),
    }),
})

export const CreateComment = z.object({
    action: z.literal('createComment'),
    data: z.object({
        profile: z.string(),
        post: z.string(),
        content: z.string(),
    }),
})

export const LikePost = z.object({
    action: z.literal('likePost'),
    data: z.object({
        profile: z.string(),
        post: z.string(),
    }),
})

export const UnlikePost = z.object({
    action: z.literal('unlikePost'),
    data: z.object({
        profile: z.string(),
        post: z.string(),
    }),
})

export const FollowProfile = z.object({
    action: z.literal('followProfile'),
    data: z.object({
        profile: z.string(),
        followingProfile: z.string(),
    }),
})

export const UnfollowProfile = z.object({
    action: z.literal('unfollowProfile'),
    data: z.object({
        profile: z.string(),
        followingProfile: z.string(),
    }),
})

export const UpdateProfileImage = z.object({
    action: z.literal('updateProfileImage'),
    data: z.object({
        profile: z.string(),
        imageUrl: z.string(),
    }),
})

export const UpdateProfileCover = z.object({
    action: z.literal('updateProfileCover'),
    data: z.object({
        profile: z.string(),
        coverUrl: z.string(),
    }),
})

export const UpdateProfileDescription = z.object({
    action: z.literal('updateProfileDescription'),
    data: z.object({
        profile: z.string(),
        description: z.string(),
    }),
})

export const FireStoreCreateProfile = z.object({
    action: z.literal('fireStoreCreateProfile'),
    data: z.object({
        name: z.string(),
        profileId: z.string(),
        isEVM: z.boolean(),
        chainId: z.string().optional(),
    }),
})

export const FireStoreCreatePost = z.object({
    action: z.literal('fireStoreCreatePost'),
    data: z.object({
        postId: z.string(),
        profileId: z.string(),
    }),
})

export const FireStoreCreateComment = z.object({
    action: z.literal('fireStoreCreateComment'),
    data: z.object({
        postId: z.string(),
        parentId: z.string(),
        profileId: z.string(),
        parentProfileId: z.string(),
    }),
})

export const FireStoreFollowProfile = z.object({
    action: z.literal('fireStoreFollowProfile'),
    data: z.object({
        followeeId: z.string(),
        followerId: z.string(),
    }),
})

export const FireStoreLikePost = z.object({
    action: z.literal('fireStoreLikePost'),
    data: z.object({
        profileId: z.string(),
        postId: z.string(),
        postAuthorId: z.string(),
    }),
})

export const FireStoreLikeComment = z.object({
    action: z.literal('fireStoreLikeComment'),
    data: z.object({
        profileId: z.string(),
        postId: z.string(),
        commentId: z.string(),
        postAuthorId: z.string(),
    }),
})

export const FireStoreMintBadge = z.object({
    action: z.literal('fireStoreMintBadge'),
    data: z.object({
        createdBadgeId: z.string(),
        badgeId: z.string(),
        minter: z.string(),
        minterProfile: z.string(),
    }),
})

export const FireStoreCreateBadgeMint = z.object({
    action: z.literal('fireStoreCreateBadgeMint'),
    data: CreateCampaginInput,
})

export const FireStoreUpdateLastActivity = z.object({
    action: z.literal('fireStoreupdateLastViewedActivity'),
    data: z.object({
        profileId: z.string(),
    }),
})

export const BadgeMintEligibility = z.object({
    action: z.literal('badgeMintEligibility'),
    data: z.object({
        profileId: z.string(),
        badgeId: z.string(),
    }),
})

export const RequestTwitterOAuthCode = z.object({
    action: z.literal('requestTwitterOAuthCode'),
    data: z.object({
        redirectUrl: z.string(),
    }),
})
export const ConnectTwitter = z.object({
    action: z.literal('connectTwitter'),
    data: z.object({
        profile: z.string(),
        oauthToken: z.string(),
        oauthVerifier: z.string(),
    }),
})
export const ConnectDiscord = z.object({
    action: z.literal('connectDiscord'),
    data: z.object({
        profile: z.string(),
        redirectUri: z.string(),
        code: z.string(),
    }),
})
export const DisconnectTwitter = z.object({
    action: z.literal('disconnectTwitter'),
    data: z.object({
        profile: z.string(),
    }),
})
export const SubmitQuest = z.object({
    action: z.literal('submitQuest'),
    data: QuestSubmissionInput,
})
export const UpdateQuestSubmission = z.object({
    action: z.literal('updateQuestSubmission'),
    data: ApproveQuestInput,
})
export const VerifyDiscordServer = z.object({
    action: z.literal('verifyDiscordServer'),
    data: VerifyDiscordServerInput,
})

export const Entrypoint = z.union([
    RequestLoginChallenge,
    RequestEthLoginChallenge,
    SubmitLoginChallenge,
    SubmitEthLoginChallenge,
    ExtendToken,
    CreateProfile,
    CreatePost,
    CreateComment,
    LikePost,
    UnlikePost,
    FollowProfile,
    UnfollowProfile,
    UpdateProfileImage,
    UpdateProfileCover,
    UpdateProfileDescription,
    FireStoreCreateProfile,
    FireStoreCreatePost,
    FireStoreCreateComment,
    FireStoreFollowProfile,
    FireStoreLikePost,
    FireStoreLikeComment,
    FireStoreMintBadge,
    FireStoreCreateBadgeMint,
    FireStoreUpdateLastActivity,
    BadgeMintEligibility,
    RequestTwitterOAuthCode,
    ConnectTwitter,
    ConnectDiscord,
    DisconnectTwitter,
    SubmitQuest,
    UpdateQuestSubmission,
    VerifyDiscordServer,
])

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

export interface IWallet {
    address: string
    veReap: number
}

export type DocFilters<T> = { path: keyof T; value: any; ops: WhereFilterOp }[] | undefined
