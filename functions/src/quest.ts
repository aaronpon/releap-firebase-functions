import { Firestore } from 'firebase-admin/lib/firestore'
import { ICampaign, IProfile, IProfileQuest, IQuestSubmission } from './types'
import { JsonRpcProvider } from '@mysten/sui.js'
import { isFollowed, isLiked, isReplyed, isRetweeted } from './twitter'
import { getDoc } from './firestore'

export async function checkManualQuest(db: Firestore, manualQuests: ICampaign['manualQuests']) {
    const manualQuestsCompleted: { questId: string; completed: boolean }[] = []
    if (manualQuests != null && manualQuests.length > 0) {
        const submission = (
            await db
                .collection('questSubmission')
                .where(
                    'questId',
                    'in',
                    manualQuests.map((it) => it.id),
                )
                .get()
        ).docs.map((it) => it.data()) as IQuestSubmission[]

        manualQuests.forEach((quest) => {
            // users may have multiple submissions for one quest, we only need to find one of them is approved
            const result = submission.find((it) => it.questId === quest.id && it.status === 'approved')
            manualQuestsCompleted.push({ questId: quest.id, completed: result != null })
        })
    }

    return manualQuestsCompleted
}

export async function checkSuiQuest(provider: JsonRpcProvider, publicKey: string, suiQuests: ICampaign['suiQuests']) {
    let suiQuestsCompleted = false
    if (suiQuests != null) {
        suiQuestsCompleted = true
        for (const suiQuest of suiQuests) {
            let completed = false
            if (suiQuest.event != null) {
                let cursor = null
                let count = 0
                let hasNext = true

                // Maxium search 250 events
                while (count < 5 && hasNext) {
                    const result = await provider.queryEvents({
                        // cannot use `All` or `And` event filter
                        query: { Sender: publicKey },
                        limit: 50,
                        order: 'descending',
                        cursor,
                    })

                    cursor = result.nextCursor
                    hasNext = result.hasNextPage

                    if (result.data.some((it) => it.type === suiQuest.event)) {
                        completed = true
                        break
                    }

                    count = count + 1
                }
            }
            if (!completed) {
                suiQuestsCompleted = false
                break
            }
        }
    } else {
        suiQuestsCompleted = true
    }

    return suiQuestsCompleted
}

export async function checkTwitterQuest(
    db: Firestore,
    profile: IProfile,
    badgeId: string,
    twitterQuest: ICampaign['twitterQuest'],
) {
    let twitterQuestCompleted: IProfileQuest | null = null
    if (twitterQuest != null) {
        if (profile.twitterId == null || profile.twitterHandle == null) {
            return { like: false, follow: false, reply: false, retweet: false }
        }
        const { like, follow, reply, retweet } = (await getDoc<IProfileQuest>(
            'profileBadgeQuests',
            `${badgeId}.${profile.profileId}`,
        )) ?? { like: false, follow: false, reply: false, retweet: false }

        // make as completed if not require
        twitterQuestCompleted = {
            like: twitterQuest.like == null || like,
            follow: twitterQuest.follow == null || follow,
            reply: twitterQuest.reply == null || reply,
            retweet: twitterQuest.retweet == null || retweet,
        }

        // require and not completed
        if (twitterQuest.like != null && !like) {
            const result = await isLiked(profile.twitterId, twitterQuest.like)
            twitterQuestCompleted.like = result
        }
        if (twitterQuest.follow != null && !follow) {
            const result = await isFollowed(profile.twitterId, twitterQuest.follow)
            twitterQuestCompleted.follow = result
        }
        if (twitterQuest.reply != null && !reply) {
            const result = await isReplyed(profile.twitterId, twitterQuest.reply)
            twitterQuestCompleted.reply = result
        }
        if (twitterQuest.retweet != null && !retweet) {
            const result = await isRetweeted(profile.twitterId, twitterQuest.retweet)
            twitterQuestCompleted.retweet = result
        }

        await db.collection('profileBadgeQuests').doc(`${badgeId}.${profile.profileId}`).set(twitterQuestCompleted)
    }

    return twitterQuestCompleted
}

export function checkQuestEligibility(
    manualQuestsCompleted: Awaited<ReturnType<typeof checkManualQuest>>,
    suiQuestCompleted: Awaited<ReturnType<typeof checkSuiQuest>>,
    twitterQuestCompleted: Awaited<ReturnType<typeof checkTwitterQuest>>,
): boolean {
    return (
        (twitterQuestCompleted == null
            ? true
            : twitterQuestCompleted?.like &&
              twitterQuestCompleted?.follow &&
              twitterQuestCompleted?.reply &&
              twitterQuestCompleted?.retweet) &&
        (suiQuestCompleted == null ? true : suiQuestCompleted) &&
        (manualQuestsCompleted.length == 0
            ? true
            : manualQuestsCompleted.reduce((acc, curr) => acc && curr.completed, true))
    )
}
