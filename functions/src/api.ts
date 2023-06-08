import { ApifyClient } from 'apify-client'
import { ApifyTwitterRes } from './types'

// Initialize the ApifyClient with API token
const client = new ApifyClient({
    token: 'apify_api_hGr4XrNcBxsY5mLd2kluTCr8TW8GAA3NdFbI',
})

export const scrapeProfile = async (twitterProfileName: string): Promise<ApifyTwitterRes[]> => {
    const task = client.task('inalienable_pony/twitter-scraper-task')

    const run = await task.call({
        addUserInfo: false,
        collectOriginalTweetOnly: true,
        debugLog: false,
        handles: [twitterProfileName],
        includeThreadsOnly: false,
        mode: 'own',
        profilesDesired: 1,
        proxyConfig: {
            useApifyProxy: true,
        },
        repliesDepth: 1,
        searchMode: 'live',
        skipPromotedTweets: false,
        skipRetweets: true,
        tweetsDesired: 1,
        useAdvancedSearch: false,
        useNewProfileScraper: false,
        useNewTweetsScraper: false,
    })

    const { items }: any = await client.dataset(run.defaultDatasetId).listItems()

    return items
}
