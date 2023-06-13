import axios from 'axios'
import { logger } from 'firebase-functions/v1'

function getTwitterBearerToken() {
    return process.env.TWITTER_BEARER_TOKEN
}

export async function isLiked(userId: string, tweetId: string): Promise<boolean> {
    const token = getTwitterBearerToken()
    try {
        const { data } = await axios.get<{ id_str: string }[]>(
            `https://api.twitter.com/1.1/favorites/list.json?count=5&user_id=${userId}`,
            {
                headers: { Authorization: token },
            },
        )

        return data.some((it) => it.id_str === tweetId)
    } catch (err) {
        logger.error('Fail to get isLiked', err)
        return false
    }
}

export async function isFollowed(followerId: string, followeeHandle: string): Promise<boolean> {
    const token = getTwitterBearerToken()
    try {
        const { data } = await axios.get<{ relationship: { source: { following: boolean } } }>(
            `https://api.twitter.com/1.1/friendships/show.json?source_id=${followerId}&target_screen_name=${followeeHandle}`,
            {
                headers: { Authorization: token },
            },
        )

        return data.relationship?.source?.following ?? false
    } catch (err) {
        logger.error('Fail to get isFollowed', err)
        return false
    }
}

export async function isReplyed(userId: string, tweetId: string): Promise<boolean> {
    const token = getTwitterBearerToken()
    try {
        const { data } = await axios.get<{ in_reply_to_status_id_str: string }[]>(
            `https://api.twitter.com/1.1/statuses/user_timeline.json?id=${userId}&include_rts=false&exclude_replies=false`,
            {
                headers: { Authorization: token },
            },
        )

        return data.some((it) => it.in_reply_to_status_id_str === tweetId)
    } catch (err) {
        logger.error('Fail to get isReplyed', err)
        return false
    }
}

export async function isRetweeted(userId: string, tweetId: string): Promise<boolean> {
    const token = getTwitterBearerToken()
    try {
        const { data } = await axios.get<{ ids: string[] }>(
            `https://api.twitter.com/1.1/statuses/retweeters/ids.json?id=${tweetId}&stringify_ids=true`,
            {
                headers: { Authorization: token },
            },
        )

        return data.ids?.includes(userId)
    } catch (err) {
        logger.error('Fail to get isRetweeted', err)
        return false
    }
}
