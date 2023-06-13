import admin from 'firebase-admin'
import { Request } from 'firebase-functions/v2/https'
import { Response } from 'express'

import { ProfileQuest, RequestContext, TwitterQuest } from './types'
import { DocumentData, Timestamp } from 'firebase-admin/firestore'
import { isFollowed, isLiked, isReplyed, isRetweeted } from './twitter'

const db = admin.firestore()
db.settings({ ignoreUndefinedProperties: true })

export const getTwitterScraperProfiles = async () => {
    const snapshot = await db.collection('twitterScraper').orderBy('lastUpdate', 'asc').limit(1).get()
    const result = snapshot.docs.map((doc) => doc.data())
    return result
}

export const updateLastScrap = async (profileName: string, createdAt: string) => {
    await db.collection('twitterScraper').doc(profileName).update({ lastUpdate: createdAt })
}

async function storeDoc(collection: string, docId: string, data: DocumentData) {
    const ref = db.collection(collection).doc(docId)
    return await ref.set(data)
}
export const updateUserTwitterData = async (
    profileAddress: string,
    twitterId: string | null,
    twitterHandle: string | null,
) => {
    const ref = db.collection('users').doc(profileAddress)
    return await ref.update({ twitterId, twitterHandle })
}

/*
 * Events schema
 * -----------
 * type: 'comment' | 'follow' | 'like'
 * profileId: profile to be notify
 * sender: sender
 * post: parent
 * postId: comment
 */
export const createProfile = async (ctx: RequestContext, req: Request, res: Response) => {
    const { name, profileId } = req.body.data

    await storeDoc('users', profileId, { name, profileId })

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
    await storeDoc('posts', postId, { postId, profileId, timeStamp })

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
    await storeDoc('comments', postId, { postId, parentId, profileId, timeStamp })
    await storeDoc('events', `${parentId}.${profileId}.comment`, {
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
    await storeDoc('events', `${followeeId}.${followerId}.follow`, {
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
    await storeDoc('events', `${postId}.${profileId}.like`, {
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
    await storeDoc('events', `${postId}.${commentId}.${profileId}.like`, {
        type: 'like',
        profileId: postAuthorId,
        sender: profileId,
        post: postId,
        postId: commentId,
        timeStamp,
    })

    res.status(201).end()
}

export const mintBadge = async (ctx: RequestContext, req: Request, res: Response) => {
    const { createdBadgeId, badgeId, minter, minterProfile } = req.body.data
    const { profiles } = ctx
    if (!profiles.includes(minterProfile)) {
        res.status(401).send("You don't own this profile").end()
        return
    }

    const timeStamp = Timestamp.now()
    await storeDoc('badges', createdBadgeId, {
        badgeId,
        minter,
        minterProfile,
        timeStamp,
    })

    res.status(201).end()
}

export const createBadgeMint = async (ctx: RequestContext, req: Request, res: Response) => {
    const { badgeId, name, description, maxSupply, imageUrl, profileId, mintList, order, twitterQuest } = req.body.data
    const { profiles } = ctx
    if (!profiles.includes(profileId)) {
        res.status(401).send("You don't own this profile").end()
        return
    }

    const existing = (await db.collection('badgeId').doc(badgeId).get()).data()

    if (existing != null && existing.profileId !== profileId) {
        res.status(401).send("You don't own this badge").end()
        return
    }

    const timeStamp = Timestamp.now()
    await storeDoc('badgeId', badgeId, {
        badgeId,
        name,
        description,
        maxSupply,
        imageUrl,
        profileId,
        mintList: mintList ?? [],
        order: order ?? 0,
        timeStamp,
        twitterQuest,
    })

    res.status(201).end()
}

export const badgeMintEligibility = async (ctx: RequestContext, req: Request, res: Response) => {
    const { badgeId, profileId } = req.body.data
    const { profiles } = ctx
    if (!profiles.includes(profileId)) {
        res.status(401).send("You don't own this profile").end()
        return
    }

    const profile = (await db.collection('users').doc(`${profileId}`).get()).data()

    if (profile == null) {
        res.status(404).send('Profile not found').end()
        return
    }

    if (profile.twitterId == null || profile.twitterHandle == null) {
        res.status(400).send('Twitter not connected').end()
        return
    }

    const { twitterQuest }: { twitterQuest?: TwitterQuest } =
        (await db.collection('badgeId').doc(badgeId).get()).data() ?? {}

    let eligible = false
    if (twitterQuest != null) {
        const { like, follow, reply, retweet }: ProfileQuest = ((
            await db.collection('profileBadgeQuests').doc(`${badgeId}.${profileId}`).get()
        ).data() ?? { like: false, follow: false, reply: false, retweet: false }) as ProfileQuest

        // make as completed if not require
        const profileQuestAfterCheck: ProfileQuest = {
            like: twitterQuest.like == null || like,
            follow: twitterQuest.follow == null || follow,
            reply: twitterQuest.reply == null || reply,
            retweet: twitterQuest.retweet == null || retweet,
        }

        // require and not completed
        if (twitterQuest.like != null && !like) {
            const result = await isLiked(profile.twitterId, twitterQuest.like)
            profileQuestAfterCheck.like = result
        }
        if (twitterQuest.follow != null && !follow) {
            const result = await isFollowed(profile.twitterId, twitterQuest.follow)
            profileQuestAfterCheck.follow = result
        }
        if (twitterQuest.reply != null && !reply) {
            const result = await isReplyed(profile.twitterId, twitterQuest.reply)
            profileQuestAfterCheck.reply = result
        }
        if (twitterQuest.retweet != null && !retweet) {
            const result = await isRetweeted(profile.twitterId, twitterQuest.retweet)
            profileQuestAfterCheck.retweet = result
        }

        await db.collection('profileBadgeQuests').doc(`${badgeId}.${profileId}`).set(profileQuestAfterCheck)
        if (
            profileQuestAfterCheck.like &&
            profileQuestAfterCheck.follow &&
            profileQuestAfterCheck.reply &&
            profileQuestAfterCheck.retweet
        ) {
            eligible = true
        } else {
            eligible = false
        }
    } else {
        eligible = true
    }
    res.json({ eligible }).end()
}
