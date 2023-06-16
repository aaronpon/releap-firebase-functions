import axios from 'axios'
import { logger } from 'firebase-functions/v1'

/*
function getTwitterBearerToken() {
    return process.env.TWITTER_BEARER_TOKEN
}
*/

function getScraperAPIToken() {
    return process.env.SCRAPER_API_TOKEN
}

export async function isLiked(userId: string, tweetId: string): Promise<boolean> {
    return true
    /*
    const token = getTwitterBearerToken()
    try {
        const { data } = await axios.get<{ id_str: string }[]>(
            `https://api.twitter.com/1.1/favorites/list.json?user_id=${userId}`,
            {
                headers: { Authorization: token },
            },
        )

        return data.some((it) => it.id_str === tweetId)
    } catch (err) {
        logger.error('Fail to get isLiked', err)
        return false
    }
    */
}

export async function isFollowed(followerId: string, followeeHandle: string): Promise<boolean> {
    return true
    /*
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
    */
}

export async function isReplyed(userId: string, tweetId: string): Promise<boolean> {
    return true
    /*
    const token = getTwitterBearerToken()
    try {
        const { data } = await axios.get<{ tweets: { retweeted_tweet: { tweet_id: string } }[] }>(
            `https://api.scraperapi.com/structured/twitter/v2/replies?api_key=${token}&user_id=${userId}`,
            {
                headers: { Authorization: token },
            },
        )

        return data.tweets.some((it) => it.retweeted_tweet?.tweet_id === tweetId)
    } catch (err) {
        logger.error('Fail to get isReplyed', err)
        return false
    }
    */
}

export async function isRetweeted(userId: string, tweetId: string): Promise<boolean> {
    const token = getScraperAPIToken()
    try {
        const { data } = await axios.get<{ tweets: { retweeted_tweet?: { tweet_id: string } }[] }>(
            `https://api.scraperapi.com/structured/twitter/v2/tweets?api_key=${token}&user_id=${userId}`,
            {
                headers: { Authorization: token },
            },
        )

        return data.tweets.some((it) => it.retweeted_tweet?.tweet_id === tweetId)
    } catch (err) {
        logger.error('Fail to get isReplyed', err)
        return false
    }
}
