import admin from 'firebase-admin'
import { randomUUID } from 'crypto'
import { Request } from 'firebase-functions/v2/https'
import { Response } from 'express'

import { RequestContext, IQuestSubmission, IProfile, ICampaign, IEvent, IPost, IComment, IBadge, IPoint } from './types'
import { QuestSubmissionInput, ApproveQuestInput, CreateCampaginInput } from './inputType'

import { DocumentData, Timestamp } from 'firebase-admin/firestore'
import { checkManualQuest, checkQuestEligibility, checkSuiQuest, checkTwitterQuest } from './quest'
import { assignRole } from './discord'

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

export async function storeDoc<T extends DocumentData>(collection: string, docId: string, data: T) {
    const ref = db.collection(collection).doc(docId)
    return await ref.set(data)
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

export const updateUserTwitterData = async (
    profileAddress: string,
    twitterId: string | null,
    twitterHandle: string | null,
) => {
    const ref = db.collection('users').doc(profileAddress)
    return await ref.update({ twitterId, twitterHandle })
}

export const updateUserDiscordData = async (
    profileAddress: string,
    discordId: string | null,
    discordHandle: string | null,
) => {
    const existingUser = await db.collection('users').where('discordId', '==', discordId).limit(1).get()
    if (existingUser.docs.length > 0) {
        await existingUser.docs[0].ref.update({ discordId: null, discordHandle: null })
    }

    const ref = db.collection('users').doc(profileAddress)
    return await ref.update({ discordId, discordHandle })
}

export const isProfileEVMOnly = async (profileName: string): Promise<boolean> => {
    const ref = db.collection('users').where('name', '==', profileName).limit(1)
    const firestoreUser: any = (await ref.get()).docs[0].data()
    console.log('IS PROFILE EVM ONLY: ', firestoreUser)
    return firestoreUser?.isEVM ?? false
}

export const createProfile = async (ctx: RequestContext, req: Request, res: Response) => {
    const { name, profileId, isEVM, chainId } = req.body.data

    await storeDoc<IProfile>('users', profileId, { name, profileId, isEVM, chainId })

    res.status(201).end()
}

export const createPost = async (ctx: RequestContext, req: Request, res: Response) => {
    const { postId, profileId } = req.body.data
    const { profiles } = ctx
    if (!profiles.includes(profileId)) {
        res.status(401).send("You don't own this profile").end()
        return
    }

    const timeStamp = Timestamp.now()
    await storeDoc<IPost>('posts', postId, { postId, profileId, timeStamp })

    res.status(201).end()
}

export const createComment = async (ctx: RequestContext, req: Request, res: Response) => {
    const { postId, parentId, profileId, parentProfileId } = req.body.data
    const { profiles } = ctx
    if (!profiles.includes(profileId)) {
        res.status(401).send("You don't own this profile").end()
        return
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

    res.status(201).end()
}

export const followProfile = async (ctx: RequestContext, req: Request, res: Response) => {
    const { followeeId, followerId } = req.body.data
    const { profiles } = ctx
    if (!profiles.includes(followerId)) {
        res.status(401).send("You don't own this profile").end()
        return
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

    res.status(201).end()
}

export const likePost = async (ctx: RequestContext, req: Request, res: Response) => {
    const { profileId, postId, postAuthorId } = req.body.data
    const { profiles } = ctx
    if (!profiles.includes(profileId)) {
        res.status(401).send("You don't own this profile").end()
        return
    }

    const timeStamp = Timestamp.now()
    await storeDoc<IEvent>('events', `${postId}.${profileId}.like`, {
        type: 'like',
        profileId: postAuthorId,
        sender: profileId,
        post: postId,
        timeStamp,
    })

    res.status(201).end()
}

export const likeComment = async (ctx: RequestContext, req: Request, res: Response) => {
    const { profileId, postId, commentId, postAuthorId } = req.body.data
    const { profiles } = ctx
    if (!profiles.includes(profileId)) {
        res.status(401).send("You don't own this profile").end()
        return
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

    res.status(201).end()
}

export const updateLastActivity = async (ctx: RequestContext, req: Request, res: Response) => {
    const { profileId } = req.body.data
    const { profiles } = ctx
    if (!profiles.includes(profileId)) {
        res.status(401).send("You don't own this profile").end()
        return
    }

    await db.collection('users').doc(profileId).update({ lastActivity: Timestamp.now() })

    res.status(201).end()
}

export const mintBadge = async (ctx: RequestContext, req: Request, res: Response) => {
    const { createdBadgeId, badgeId, minter, minterProfile } = req.body.data
    const { profiles } = ctx
    //const { profiles, provider, publicKey } = ctx
    if (!profiles.includes(minterProfile)) {
        res.status(401).send("You don't own this profile").end()
        return
    }

    const mintedBadge = await getDoc<IBadge>('badges', createdBadgeId)

    if (mintedBadge != null) {
        res.status(400).send('The badge already created').end()
        return
    }

    const badge = await getDoc<ICampaign>('badgeId', badgeId)
    const profile = await getDoc<IProfile>('users', minterProfile)

    if (badge == null) {
        res.status(400).send('Invaild badge').end()
        return
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
            res.status(400).send('Fail to get badge from chain').end()
            return
        }
        if (!data.type?.match(/releap_badge/)) {
            res.status(400).send('Incorrect data type').end()
            return
        }

        const isVaildOwner =
            typeof data.owner === 'object' && 'AddressOwner' in data.owner && data.owner?.AddressOwner === publicKey

        if (!isVaildOwner) {
            res.status(400).send('Incorrect owner').end()
            return
        }
        */
    } catch (err) {
        res.status(400).send('Fail to get badge from chain').end()
        return
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

    res.status(201).end()
}

export const createBadgeMint = async (ctx: RequestContext, req: Request, res: Response) => {
    const result = await CreateCampaginInput.passthrough().safeParseAsync(req.body.data)

    if (!result.success) {
        res.status(400).send(result.error.message)
        return
    }
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
    } = result.data

    const { profiles } = ctx

    if (!profiles.includes(profileId)) {
        res.status(401).send("You don't own this profile").end()
        return
    }

    const existing = await getDoc<ICampaign>('badgeId', badgeId)

    if (existing != null && existing.profileId !== profileId) {
        res.status(401).send("You don't own this badge").end()
        return
    }

    const timeStamp = Timestamp.now()
    await storeDoc<ICampaign>('badgeId', badgeId, {
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
    })

    res.status(201).end()
}

export const badgeMintEligibility = async (ctx: RequestContext, req: Request, res: Response) => {
    const { badgeId, profileId } = req.body.data
    const { profiles, publicKey, provider } = ctx
    if (!profiles.includes(profileId)) {
        res.status(401).send("You don't own this profile").end()
        return
    }

    const profile = await getDoc<IProfile>('users', profileId)

    if (profile == null) {
        res.status(404).send('Profile not found').end()
        return
    }

    const { twitterQuest, suiQuests, manualQuests } = (await getDoc<ICampaign>('badgeId', badgeId)) ?? {}

    const manualQuestsCompleted = await checkManualQuest(db, profile, manualQuests)
    const suiQuestCompleted = await checkSuiQuest(provider, publicKey, suiQuests)
    const twitterQuestCompleted = await checkTwitterQuest(db, profile, badgeId, twitterQuest)

    const eligible = checkQuestEligibility(manualQuestsCompleted, suiQuestCompleted, twitterQuestCompleted)

    res.json({
        eligible,
        twitterQuestCompleted,
        suiQuestCompleted,
        manualQuestsCompleted,
    }).end()
}

export const submitQuest = async (ctx: RequestContext, req: Request, res: Response) => {
    const parseResult = await QuestSubmissionInput.safeParseAsync(req.body.data)

    if (!parseResult.success) {
        res.status(400).send(parseResult.error.message).end()
        return
    }

    const { questId, data, badgeId, profileId } = parseResult.data
    const { profiles, publicKey } = ctx

    if (!profiles.includes(profileId)) {
        res.status(401).send("You don't own this profile").end()
        return
    }

    const task: IQuestSubmission = {
        badgeId,
        questId,
        wallet: publicKey,
        profileId,
        data,
        status: 'pending',
        createdAt: Timestamp.now(),
    }

    await storeDoc<IQuestSubmission>('tasks', randomUUID(), task)

    res.status(201).end()
}

export const updateQuestSubmission = async (ctx: RequestContext, req: Request, res: Response) => {
    const parseResult = await ApproveQuestInput.safeParseAsync(req.body.data)

    if (!parseResult.success) {
        res.status(400).send(parseResult.error.message).end()
        return
    }

    const { submissionId, action } = req.body.data
    const { role, profiles } = ctx

    const submission = await getDoc<IQuestSubmission>('questSubmission', submissionId)

    if (submission == null) {
        res.status(404).end()
        return
    }

    const campaign = (
        await db.collection('badgeId').where('manualQuests.questId', '==', submission.questId).limit(1).get()
    ).docs[0].data() as ICampaign

    if (!profiles.includes(campaign.profileId) && role != 'admin') {
        res.status(401).send('Only campaign owner or admin can update quest submission').end()
        return
    }

    await storeDoc<IQuestSubmission>('questSubmission', submissionId, {
        ...submission,
        status: action === 'approved' ? 'approved' : 'rejected',
        updatedAt: Timestamp.now(),
    })

    res.status(201).end()
}
