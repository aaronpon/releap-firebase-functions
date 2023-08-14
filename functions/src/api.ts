import { ApifyClient } from 'apify-client'
import { ApifyTwitterRes } from './types'

// Initialize the ApifyClient with API token
const apikeys = [
    { token: 'apify_api_hGr4XrNcBxsY5mLd2kluTCr8TW8GAA3NdFbI', client: 'inalienable_pony/twitter-scraper-task' },
    {
        token: 'apify_api_hGr4XrNcBxsY5mLd2kluTCr8TW8GAA3NdFbI',
        client: 'inalienable_pony/twitter-profile-tweets-scraper-temp-fix',
    },
    { token: 'apify_api_kkOyeZBCaxZIQL89Odagqmw55O98io0GOs00', client: 'guiltless_shrub/twitter-scraper' },
]

const activeAccount = 1

const client = new ApifyClient({
    token: apikeys[activeAccount].token,
})

export const scrapeProfile = async (twitterProfileName: string): Promise<ApifyTwitterRes[]> => {
    const task = client.task(apikeys[activeAccount].client)

    const run = await task.call({
        addUserInfo: false,
        profileMode: 'replies',
        tweetsDesired: 100,
        usernames: [twitterProfileName],
    })

    const { items }: any = await client.dataset(run.defaultDatasetId).listItems()

    return items
}
