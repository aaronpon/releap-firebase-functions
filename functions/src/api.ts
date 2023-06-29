import { ApifyClient } from 'apify-client'
import { ApifyTwitterRes } from './types'

// Initialize the ApifyClient with API token
const client = new ApifyClient({
    token: 'apify_api_kkOyeZBCaxZIQL89Odagqmw55O98io0GOs00',
})

export const scrapeProfile = async (twitterProfileName: string): Promise<ApifyTwitterRes[]> => {
    const task = client.task('guiltless_shrub/twitter-scraper')

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
