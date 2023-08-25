/* eslint-disable @typescript-eslint/no-unused-vars */
import admin from 'firebase-admin'
import { randomUUID } from 'crypto'

import {
    RequestContext,
    IQuestSubmission,
    IProfile,
    ICampaign,
    IEvent,
    IPost,
    IComment,
    IBadge,
    IPoint,
    FireStoreCreateProfile,
    FireStoreCreatePost,
    FireStoreCreateComment,
    FireStoreFollowProfile,
    FireStoreLikeComment,
    FireStoreLikePost,
    FireStoreMintBadge,
    FireStoreCreateBadgeMint,
    FireStoreUpdateLastActivity,
    BadgeMintEligibility,
    SubmitQuest,
    UpdateQuestSubmission,
    DocFilters,
} from './types'

import { CollectionReference, DocumentData, Query, Timestamp } from 'firebase-admin/firestore'
import { checkManualQuest, checkQuestEligibility, checkSuiQuest, checkTwitterQuest } from './quest'
import { assignRole } from './discord'
import { AuthError, BadRequest, NotFoundError, ServerError } from './error'
import { z } from 'zod'

export const db = admin.firestore()
db.settings({ ignoreUndefinedProperties: true })

export const getTwitterScraperProfiles = async () => {
    const snapshot = await db.collection('twitterScraper').orderBy('lastUpdate', 'asc').limit(1).get()
    const result = snapshot.docs.map((doc) => doc.data())
    return result
}

export const updateLastScrap = async (profileName: string, createdAt: string) => {
    await db.collection('twitterScraper').doc(profileName).update({ lastUpdate: createdAt })
}

export async function getDoc<T>(collection: string, docId: string): Promise<T> {
    const ref = db.collection(collection).doc(docId)
    return (await ref.get()).data() as T
}

export async function getCountFromServer<T>(
    collection: string,
    {
        filters = [],
    }: {
        filters?: DocFilters<T>
    },
): Promise<number> {
    let ref: Query<DocumentData> | CollectionReference<DocumentData> = db.collection(collection)

    filters.forEach((filter) => {
        ref = ref.where(filter.path as string, filter.ops, filter.value)
    })

    return (await ref.get()).size
}

export async function getDocs<T>(
    collection: string,
    {
        filters = [],
        orderBy,
        descending = true,
        skip = 0,
        limit = 0,
    }: {
        filters?: DocFilters<T>
        orderBy?: keyof T
        descending?: boolean
        skip?: number
        limit?: number
    },
): Promise<T[]> {
    let ref: Query<DocumentData> | CollectionReference<DocumentData> = db.collection(collection)

    if (orderBy != null) {
        ref = ref.orderBy(orderBy as string, descending ? 'desc' : 'asc')
    }

    filters.forEach((filter) => {
        ref = ref.where(filter.path as string, filter.ops, filter.value)
    })

    ref = ref.offset(skip).limit(limit)

    return (await ref.get()).docs.map((it) => it.data()) as T[]
}

export async function storeDoc<T extends DocumentData>(collection: string, docId: string, data: Partial<T>) {
    const ref = db.collection(collection).doc(docId)
    return await ref.set(data, { merge: true })
}

export async function findProfileOwnerCap(profile: string) {
    return (await getDoc<{ profileOwnerCap: string }>('profileOwnerCaps', profile))?.profileOwnerCap
}

export async function setProfileOwnerCap(profile: string, profileOwnerCap: string) {
    return await storeDoc('profileOwnerCaps', profile, { profileOwnerCap })
}

export async function addCampaignPoint(campaignProfile: string, minter: string, point: number) {
    const ref = db
        .collection('campaignPoints')
        .where('campaignProfile', '==', campaignProfile)
        .where('minter', '==', minter)
        .limit(1)
    await db.runTransaction(
        async (tx) => {
            const doc = (await tx.get(ref)).docs[0]
            if (doc != null) {
                const data: { campaignProfile: string; minter: string; point: number } = doc.data() as any
                tx.set(doc.ref, { ...data, point: data.point + point }, { merge: true })
            } else {
                const data = {
                    campaignProfile,
                    minter,
                    point,
                }
                tx.set(db.collection('campaignPoints').doc(`${campaignProfile}.${minter}`), data)
            }
        },
        { maxAttempts: 100 },
    )
}

export async function updateUserTwitterData(
    profileAddress: string,
    twitterId: string | null,
    twitterHandle: string | null,
) {
    const ref = db.collection('users').doc(profileAddress)
    return await ref.update({ twitterId, twitterHandle })
}

export async function updateUserDiscordData(
    profileAddress: string,
    discordId: string | null,
    discordHandle: string | null,
) {
    const existingUser = await db.collection('users').where('discordId', '==', discordId).limit(1).get()
    if (existingUser.docs.length > 0) {
        await existingUser.docs[0].ref.update({ discordId: null, discordHandle: null })
    }

    const ref = db.collection('users').doc(profileAddress)
    return await ref.update({ discordId, discordHandle })
}

export async function isProfileEVMOnly(profileName: string): Promise<boolean> {
    const [profile] = await getDocs<IProfile>('users', {
        filters: [{ path: 'name', ops: '==', value: profileName }],
        limit: 1,
    })
    if (profile) {
        console.log('Checking if user is EVM: ', profileName)
        return profile?.isEVM ?? false
    } else {
        throw new Error('No profile found in firebase')
    }
}

export async function createProfile(ctx: RequestContext, data: z.infer<typeof FireStoreCreateProfile>['data']) {
    const { name, profileId, isEVM, chainId } = data

    await storeDoc<IProfile>('users', profileId, { name, profileId, isEVM, chainId, activeWallet: ctx.publicKey })

    return { success: true }
}

export async function createPost(ctx: RequestContext, data: z.infer<typeof FireStoreCreatePost>['data']) {
    const { postId, profileId } = data
    const { profiles } = ctx
    if (!profiles.includes(profileId)) {
        throw new AuthError("You don't own this profile")
    }

    const timeStamp = Timestamp.now()
    await storeDoc<IPost>('posts', postId, { postId, profileId, timeStamp })
    await storeDoc<IProfile>('users', profileId, { activeWallet: ctx.publicKey })

    return { success: true }
}

export async function createComment(ctx: RequestContext, data: z.infer<typeof FireStoreCreateComment>['data']) {
    const { postId, parentId, profileId, parentProfileId } = data
    const { profiles } = ctx
    if (!profiles.includes(profileId)) {
        throw new AuthError("You don't own this profile")
    }

    const timeStamp = Timestamp.now()
    await storeDoc<IComment>('comments', postId, { postId, parentId, profileId, timeStamp })
    await storeDoc<IEvent>('events', `${parentId}.${profileId}.comment`, {
        type: 'comment',
        profileId: parentProfileId,
        sender: profileId,
        post: parentId,
        postId,
        timeStamp,
    })
    await storeDoc<IProfile>('users', profileId, { activeWallet: ctx.publicKey })

    return { success: true }
}

export async function followProfile(ctx: RequestContext, data: z.infer<typeof FireStoreFollowProfile>['data']) {
    const { followeeId, followerId } = data
    const { profiles } = ctx
    if (!profiles.includes(followerId)) {
        throw new AuthError("You don't own this profile")
    }

    const timeStamp = Timestamp.now()
    await storeDoc<IEvent>('events', `${followeeId}.${followerId}.follow`, {
        type: 'follow',
        profileId: followeeId,
        sender: followerId,
        post: null,
        postId: null,
        timeStamp,
    })
    await storeDoc<IProfile>('users', followerId, { activeWallet: ctx.publicKey })

    return { success: true }
}

export async function likePost(ctx: RequestContext, data: z.infer<typeof FireStoreLikePost>['data']) {
    const { profileId, postId, postAuthorId } = data
    const { profiles } = ctx
    if (!profiles.includes(profileId)) {
        throw new AuthError("You don't own this profile")
    }

    const timeStamp = Timestamp.now()
    await storeDoc<IEvent>('events', `${postId}.${profileId}.like`, {
        type: 'like',
        profileId: postAuthorId,
        sender: profileId,
        post: postId,
        timeStamp,
    })
    await storeDoc<IProfile>('users', profileId, { activeWallet: ctx.publicKey })

    return { success: true }
}

export async function likeComment(ctx: RequestContext, data: z.infer<typeof FireStoreLikeComment>['data']) {
    const { profileId, postId, commentId, postAuthorId } = data
    const { profiles } = ctx
    if (!profiles.includes(profileId)) {
        throw new AuthError("You don't own this profile")
    }

    const timeStamp = Timestamp.now()
    await storeDoc<IEvent>('events', `${postId}.${commentId}.${profileId}.like`, {
        type: 'like',
        profileId: postAuthorId,
        sender: profileId,
        post: postId,
        postId: commentId,
        timeStamp,
    })
    await storeDoc<IProfile>('users', profileId, { activeWallet: ctx.publicKey })

    return { success: true }
}

export async function updateLastActivity(
    ctx: RequestContext,
    data: z.infer<typeof FireStoreUpdateLastActivity>['data'],
) {
    const { profileId } = data
    const { profiles } = ctx
    if (!profiles.includes(profileId)) {
        throw new AuthError("You don't own this profile")
    }

    await db.collection('users').doc(profileId).update({ lastActivity: Timestamp.now() })
    await storeDoc<IProfile>('users', profileId, { activeWallet: ctx.publicKey })

    return { success: true }
}

export async function mintBadge(ctx: RequestContext, data: z.infer<typeof FireStoreMintBadge>['data']) {
    const { createdBadgeId, badgeId, minter, minterProfile } = data
    const { profiles } = ctx
    //const { profiles, provider, publicKey } = ctx
    if (!profiles.includes(minterProfile)) {
        throw new AuthError("You don't own this profile")
    }

    const mintedBadge = await getDoc<IBadge>('badges', createdBadgeId)

    if (mintedBadge != null) {
        throw new BadRequest('The badge already created')
    }

    const badge = await getDoc<ICampaign>('badgeId', badgeId)
    const profile = await getDoc<IProfile>('users', minterProfile)

    if (badge == null) {
        throw new BadRequest('Invalid badge')
    }

    try {
        // sleep 2 sec, to wait RPC sync
        /*
        await sleep(2000)
        const { data, error } = await provider.getObject({
            id: badgeId,
            options: { showType: true, showBcs: false, showOwner: true, showContent: false, showDisplay: false },
        })
        if (error != null || data == null) {
            throw new BadRequest('Fail to get badge from chain')
        }
        if (!data.type?.match(/releap_badge/)) {
            throw new BadRequest('Incorrect data type')
        }

        const isVaildOwner =
            typeof data.owner === 'object' && 'AddressOwner' in data.owner && data.owner?.AddressOwner === publicKey

        if (!isVaildOwner) {
            throw new BadRequest('Incorrect owner')
        }
        */
    } catch (err) {
        throw new ServerError('Fail to get badge from chain')
    }

    const timeStamp = Timestamp.now()
    await storeDoc<IBadge>('badges', createdBadgeId, {
        badgeId,
        minter,
        minterProfile,
        timeStamp,
    })

    await storeDoc<IPoint>('points', `${badgeId}.${minter}`, {
        badgeId,
        minter,
        campaignProfile: badge.profileId,
        point: badge.point ?? 0,
        timeStamp,
    })

    if (badge.point != null && badge.point > 0) {
        await addCampaignPoint(badge.profileId, minter, badge.point)
    }
    if (badge.discordReward != null) {
        if (profile.discordId != null) {
            await assignRole({
                serverId: badge.discordReward.serverId,
                roleId: badge.discordReward.roleId,
                userId: profile.discordId,
            })
        }
    }

    return { success: true }
}

export async function createBadgeMint(ctx: RequestContext, data: z.infer<typeof FireStoreCreateBadgeMint>['data']) {
    const {
        badgeId,
        name,
        description,
        maxSupply,
        imageUrl,
        profileId,
        mintList,
        order,
        twitterQuest,
        point,
        suiQuests,
        type,
        manualQuests,
        discordReward,
    } = data

    const { profiles } = ctx

    if (!profiles.includes(profileId)) {
        throw new AuthError("You don't own this profile")
    }

    const existing = await getDoc<ICampaign>('badgeId', badgeId)

    if (existing != null && existing.profileId !== profileId) {
        throw new AuthError("You don't own this badge")
    }

    const timeStamp = Timestamp.now()
    const campaign = {
        badgeId,
        name,
        description,
        maxSupply,
        imageUrl,
        profileId,
        mintList: mintList ?? [],
        order: order ?? 0,
        point: point ?? 0,
        timeStamp,
        twitterQuest,
        suiQuests,
        type: type ?? 'sui',
        // not verifiy discord setting here, frontend should use other API to verfiy the setting before creating the campagin
        discordReward,
        // Assign ID to manual quest
        manualQuests: manualQuests?.map((quest) => {
            return {
                ...quest,
                id: quest.id ?? randomUUID(),
            }
        }),
    }
    await storeDoc<ICampaign>('badgeId', badgeId, campaign)

    return campaign
}

export async function badgeMintEligibility(ctx: RequestContext, data: z.infer<typeof BadgeMintEligibility>['data']) {
    const { badgeId, profileId } = data
    const { profiles, publicKey, provider } = ctx
    if (!profiles.includes(profileId)) {
        throw new AuthError("You don't own this profile")
    }

    const profile = await getDoc<IProfile>('users', profileId)

    if (profile == null) {
        throw new NotFoundError('Profile not found')
    }

    const { twitterQuest, suiQuests, manualQuests } = (await getDoc<ICampaign>('badgeId', badgeId)) ?? {}

    const manualQuestsCompleted = await checkManualQuest(db, profile, manualQuests)
    const suiQuestCompleted = await checkSuiQuest(provider, publicKey, suiQuests)
    const twitterQuestCompleted = await checkTwitterQuest(db, profile, badgeId, twitterQuest)

    const eligible = checkQuestEligibility(manualQuestsCompleted, suiQuestCompleted, twitterQuestCompleted)

    return {
        eligible,
        twitterQuestCompleted,
        suiQuestCompleted,
        manualQuestsCompleted,
    }
}

export async function submitQuest(ctx: RequestContext, payload: z.infer<typeof SubmitQuest>['data']) {
    const { questId, data, badgeId, profileId } = payload
    const { profiles, publicKey } = ctx

    if (!profiles.includes(profileId)) {
        throw new AuthError("You don't own this profile")
    }

    const [existingSubmission, campaign] = (await Promise.all([
        db
            .collection('questSubmission')
            .where('badgeId', '==', badgeId)
            .where('questId', '==', questId)
            .where('profileId', '==', profileId)
            .where('status', 'in', ['pending', 'approved'])
            .get(),
        db.collection('badgeId').where('badgeId', '==', badgeId).limit(1).get(),
    ])) as [admin.firestore.QuerySnapshot<IQuestSubmission>, admin.firestore.QuerySnapshot<ICampaign>]

    if (existingSubmission.size > 0) {
        throw new BadRequest('You already submitted this quest')
    }

    const task: IQuestSubmission = {
        badgeId,
        owner: campaign.docs[0].data().profileId,
        questId,
        wallet: publicKey,
        profileId,
        data,
        status: 'pending',
        createdAt: Timestamp.now(),
    }

    await storeDoc<IQuestSubmission>('questSubmission', randomUUID(), task)

    return { success: true }
}

export const updateQuestSubmission = async (
    ctx: RequestContext,
    data: z.infer<typeof UpdateQuestSubmission>['data'],
) => {
    const { submissionId, action } = data
    const { profiles } = ctx
    const submission = await getDoc<IQuestSubmission>('questSubmission', submissionId)

    if (submission == null) {
        throw new NotFoundError()
    }

    const campaign = (
        await db.collection('badgeId').where('badgeId', '==', submission.badgeId).limit(1).get()
    ).docs[0].data() as ICampaign

    if (!profiles.includes(campaign.profileId)) {
        // && role != 'admin'
        throw new AuthError('Only campaign owner or admin can update quest submission')
    }

    await storeDoc<IQuestSubmission>('questSubmission', submissionId, {
        ...submission,
        status: action === 'approved' ? 'approved' : 'rejected',
        updatedAt: Timestamp.now(),
    })

    return { success: true }
}
