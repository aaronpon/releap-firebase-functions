import { ApifyClient } from 'apify-client'
import { ApifyTwitterRes } from './types'

// Initialize the ApifyClient with API token
const apikeys = [
    { token: 'apify_api_hGr4XrNcBxsY5mLd2kluTCr8TW8GAA3NdFbI', client: 'inalienable_pony/twitter-scraper-task' }, //areleap
    { token: 'apify_api_kkOyeZBCaxZIQL89Odagqmw55O98io0GOs00', client: 'guiltless_shrub/twitter-scraper' }, //jailm
    { token: 'apify_api_yh34WQDa8rijet2UDwBmcuodjZ03EG3dA2QF', client: 'scrupulous_nut/twitter-scraper-task' }, //pcl
    {
        token: 'apify_api_herQ8kz0pqfqc3mGYD98uQ3QoMujQq1UH0el',
        client: 'user-zl3ztde5nnpbrvqjb/twitter-scraper-task',
    }, //hunt
    {
        token: 'apify_api_au9J65TLlelQ9DfmFkmq1N0p51xZFP41lH4O',
        client: 'user-xtazqikwnu4us7ace/twitter-scraper-task',
    }, //networks
]

export const scrapeProfile = async (twitterProfileName: string, activeAccount: number): Promise<ApifyTwitterRes[]> => {
    const client = new ApifyClient({
        token: apikeys[activeAccount].token,
    })

    const task = client.task(apikeys[activeAccount].client)

    console.log('USING API KEY: ', apikeys[activeAccount].token)

    const run = await task.call({
        addUserInfo: false,
        profileMode: 'replies',
        tweetsDesired: 100,
        proxyConfig: {
            useApifyProxy: true,
        },
        handles: [twitterProfileName],
    })

    const { items }: any = await client.dataset(run.defaultDatasetId).listItems()

    return items
}
