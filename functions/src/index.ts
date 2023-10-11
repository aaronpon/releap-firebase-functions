import { onRequest } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import * as logger from 'firebase-functions/logger'
import admin from 'firebase-admin'

admin.initializeApp()
import {
    extendToken,
    requestEthLoginChallenge,
    requestLoginChallenge,
    submitEthLoginChallenge,
    submitLoginChallenge,
} from './auth'
import {
    createPost,
    createComment,
    likePost,
    unlikePost,
    followProfile,
    unfollowProfile,
    adminCreatePost,
    createProfile,
    updateProfileImage,
    updateProfileCover,
    updateProfileDescription,
} from './sponsorTx'
import { getTwitterScraperProfiles, updateLastScrap as updateLastScrape } from './firestore'
import { scrapeProfile as scrapeTweets } from './api'
import { ApifyTwitterRes, Entrypoint } from './types'

import * as firestore from './firestore'
import * as oauth from './oauth'
import * as discord from './discord'
import { rebalanceGas } from './task'
import { AuthError } from './error'
import { commonOnRequestSettings, requestParser } from './utils'

export { taskCreated } from './task'
export { governance } from './governance'
export { curation } from './curation'
export { profile } from './profile'
export { bundlr } from './bundlr'

export const entrypoint = onRequest(
    {
        ...commonOnRequestSettings,
        secrets: [
            'JWT_SECRET',
            'TWITTER_COMSUMER_SECRET',
            'TWITTER_BEARER_TOKEN',
            'SCRAPER_API_TOKEN',
            'DISCORD_CLIENT_SECRET',
            'DISCORD_BOT_TOKEN',
        ],
        minInstances: 2,
        memory: '1GiB',
    },
    requestParser({ body: Entrypoint, requireAuth: 'optional' }, async (payload) => {
        const { action, data } = payload.body
        switch (action) {
            // JWT login, no auth required
            case 'requestLoginChallenge':
                return await requestLoginChallenge(data)
            case 'submitLoginChallenge':
                return await submitLoginChallenge(payload.req, data)
            case 'requestEthLoginChallenge':
                return await requestEthLoginChallenge(data)
            case 'submitEthLoginChallenge':
                return await submitEthLoginChallenge(payload.req, data)
            default:
                // auth required
                if (payload.ctx == null) {
                    throw new AuthError('Login required')
                }
                switch (action) {
                    case 'extendToken':
                        return await extendToken(payload.ctx)
                    // Sponsored tx
                    case 'createProfile':
                        return await createProfile(payload.ctx, data)
                    case 'createPost':
                        return await createPost(payload.ctx, data)
                    case 'createComment':
                        return await createComment(payload.ctx, data)
                    case 'likePost':
                        return await likePost(payload.ctx, data)
                    case 'unlikePost':
                        return await unlikePost(payload.ctx, data)
                    case 'followProfile':
                        return await followProfile(payload.ctx, data)
                    case 'unfollowProfile':
                        return await unfollowProfile(payload.ctx, data)
                    case 'updateProfileImage':
                        return await updateProfileImage(payload.ctx, data)
                    case 'updateProfileCover':
                        return await updateProfileCover(payload.ctx, data)
                    case 'updateProfileDescription':
                        return await updateProfileDescription(payload.ctx, data)
                    // Firestore
                    case 'fireStoreCreateProfile':
                        return await firestore.createProfile(payload.ctx, data)
                    case 'fireStoreCreatePost':
                        return await firestore.createPost(payload.ctx, data)
                    case 'fireStoreCreateComment':
                        return await firestore.createComment(payload.ctx, data)
                    case 'fireStoreFollowProfile':
                        return await firestore.followProfile(payload.ctx, data)
                    case 'fireStoreLikePost':
                        return await firestore.likePost(payload.ctx, data)
                    case 'fireStoreLikeComment':
                        return await firestore.likeComment(payload.ctx, data)
                    case 'fireStoreMintBadge':
                        return await firestore.mintBadge(payload.ctx, data)
                    case 'fireStoreCreateBadgeMint':
                        return await firestore.createBadgeMint(payload.ctx, data)
                    case 'fireStoreupdateLastViewedActivity':
                        return await firestore.updateLastActivity(payload.ctx, data)
                    case 'badgeMintEligibility':
                        return await firestore.badgeMintEligibility(payload.ctx, data)
                    // Twitter OAuth
                    case 'requestTwitterOAuthCode':
                        return await oauth.requestTwitterOAuthCode(payload.ctx, data)
                    case 'connectTwitter':
                        return await oauth.connectTwitter(payload.ctx, data)
                    case 'connectDiscord':
                        return await oauth.connectDiscord(payload.ctx, data)
                    case 'disconnectTwitter':
                        return await oauth.disconnectTwitter(payload.ctx, data)
                    case 'submitQuest':
                        return await firestore.submitQuest(payload.ctx, data)
                    case 'updateQuestSubmission':
                        return await firestore.updateQuestSubmission(payload.ctx, data)
                    case 'verifyDiscordServer':
                        return await discord.verifyDiscordServer(payload.ctx, data)
                }
        }
    }),
)

export const twitterPostingV2 = onSchedule(
    {
        schedule: 'every 8 minutes',
        timeoutSeconds: 180,
    },
    async () => {
        const profilesToScrap = await getTwitterScraperProfiles()
        await Promise.all(
            profilesToScrap.map(async (profile) => {
                const lastUpdate = profile.lastUpdate

                logger.info(`Scraping profiles: ${profile.twitter}, last update at ${lastUpdate}`)

                const index = Math.floor(Math.random() * 99)

                const activeAccount = Math.floor(Math.random() * 4)

                const tweet: ApifyTwitterRes = (await scrapeTweets(profile.twitter, activeAccount))[index]

                await updateLastScrape(profile.name, new Date().toISOString())

                if (!tweet.full_text.includes('RT') && tweet.full_text.split('@').length < 3) {
                    logger.info(`Got Tweet: ${profile.twitter}, ${tweet.full_text}`)

                    const mediaUrl =
                        tweet.media.length > 0
                            ? tweet.media[0]?.video_url == null
                                ? tweet.media[0].media_url
                                : tweet.media[0].video_url.split('.mp4')[0] + '.mp4'
                            : ''

                    const res: any = await adminCreatePost(
                        profile.profileId,
                        mediaUrl,
                        tweet.full_text.replace(/https:\/\/t\.co\S*/g, '').replace(/@/g, ''),
                    )

                    const createdPostId =
                        res.effects?.created?.find((it: any) => {
                            if (typeof it.owner === 'object' && 'Shared' in it.owner) {
                                return it.owner.Shared.initial_shared_version === it.reference.version
                            }
                            return ''
                        })?.reference?.objectId ?? ''

                    await admin.firestore().collection('posts').doc(createdPostId).create({
                        postId: createdPostId,
                        timeStamp: admin.firestore.FieldValue.serverTimestamp(),
                        profileId: profile.profileId,
                    })
                }
            }),
        )
    },
)

export const rebalance = onSchedule(
    {
        secrets: ['SEED_PHRASE'],
        schedule: '1 of month 09:00',
    },
    async () => {
        await rebalanceGas(true)
    },
)

// for benchmark only
/*
export const benchmark = onRequest(
    {
        secrets: ['SEED_PHRASE'],
    },
    async (_req, res) => {
        await rebalanceGas(true)

        const profile = '0x9ed961509b7119618dd0ca4fbcf9dfc09ed587c59be980aac1d5237794664666'

        const profilesToFollow = [
            '0x00fa3b080058731c39122b06d6af844c46a5270230409a41a39e2089816c7ea3',
            '0x0133a88b590e4a3e9f8c5c10d28610355dcef3c33eb5f62e531063f3ca4de337',
            '0x013c9f711678b5273f3e1e27dd586fa2a5f6b774f5c02bc2a3e19e97eb7e364c',
            '0x014523637e97950927dbea0d7eda153d495ef343513dc6d4ac42bc2c0ebdd525',
            '0x01480e68f8f5d9e9c07b98fa3970eadb13203c5617ff853035d238df712d446a',
            '0x0155a938c5ccbfb08b8948af31439a30841a4b1ae75e9ee6ae6dadc83a820f02',
            '0x0156172d697cf86fa46aca1a3adb5879310b30db8d023734ed7fc06008faaaf2',
            '0x015c5ba4646cee0ee96d8676fd3be27c54bb6f822e339a0fd2fd81906d700773',
            '0x01650c2db9f02d699beea50543ed9b72a9636f06216894f18795ae41f40068f7',
            '0x017760a26408b20fe586906584e35da0a8b0f2d946598e0c26c5f74ea8a8c9c8',
            '0x017b8a78a025cddcfae1086eec4f36c2fc76f4a1211715e6119ada71b9df8c2e',
            '0x018bc9c36663e4ac0e8ddf2740c97bcc8a441d86ba776feffce4d5dd7a0849d3',
            '0x019ca23efa6f10bcf555571351007f6ec50264ca0252498a82001d1985f1fc05',
            '0x01c0f168fbae22f556fc2ae177010c4f9d86c4d26795c743defa5526d20e5ff6',
            '0x01f140aef3460da57baa7fd87d268a0a4a339470795d610e86014e1f093115d3',
            '0x02581e21b56259d22ab2f79f5948163c46a68d351d2b1715361e3bbbb0d8e559',
            '0x0274d84bfbc424bf37ebbd3e5fcaa4400bc3ef2d65fe462d99aa780908da7dd5',
            '0x028626e2bff45e1e83797ebc231557e5b18c45929c3eacb6f7c55d92f26bf39e',
            '0x029927e64e00be6a63e4163904187e6d4ddae33eeadcc03ada2890810c305424',
            '0x02d46271af1ff236a8270e4daeb33500725192337cb205c52014184c4d88b072',
        ]
        const keypair = Ed25519Keypair.deriveKeypair(process.env.SEED_PHRASE as string)
        const provider = new JsonRpcProvider(new Connection({ fullnode: RPC }))

        const shareCtx: ShareContext = {
            provider,
            signer: new RawSigner(keypair, provider),
            dappPackages: process.env.DAPP_PACKAGES?.split(',') ?? [],
            recentPosts: process.env.RECENT_POSTS as string,
            adminCap: process.env.ADMIN_CAP as string,
            index: process.env.INDEX as string,
            profileTable: process.env.PROFILE_TABLE as string,
        }

        const tasks = profilesToFollow.map(async (followingProfile) => {
            await sleep(Math.random() * 2000)
            const task: TaskRequest = {
                data: {
                    action: 'followProfile',
                    payload: { profile, followingProfile },
                },
            }

            console.time(followingProfile)
            await tasksRunner(shareCtx, [task])
            console.timeEnd(followingProfile)
        })

        await Promise.all(tasks)

        res.end()
    },
)
*/
