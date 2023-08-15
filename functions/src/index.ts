import { onRequest } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { pubsub } from 'firebase-functions'
import * as logger from 'firebase-functions/logger'
import admin from 'firebase-admin'

admin.initializeApp()
import {
    extendToken,
    applyJwtValidation,
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
import { ApifyTwitterRes } from './types'

import * as firestore from './firestore'
import * as oauth from './oauth'
import * as discord from './discord'
import { rebalanceGas } from './task'
import { BadRequest, ForbiddenError } from './error'
import { errorCaptured } from './utils'

export { taskCreated } from './task'
export { governance, votes, votings } from './governance'

export const entrypoint = onRequest(
    {
        secrets: [
            'JWT_SECRET',
            'TWITTER_COMSUMER_SECRET',
            'TWITTER_BEARER_TOKEN',
            'SCRAPER_API_TOKEN',
            'DISCORD_CLIENT_SECRET',
            'DISCORD_BOT_TOKEN',
        ],
        cors: [/localhost/, /.*\.releap\.xyz$/, /localhost:3000/, /.*\.d1doiqjkpgeoca\.amplifyapp\.com/],
        minInstances: 2,
        timeoutSeconds: 180,
        memory: '1GiB',
    },
    errorCaptured(async (req, res) => {
        if (req.method !== 'POST') {
            throw new ForbiddenError('Method not allow')
        }

        logger.info(`Action: ${req.body.action}`, { data: req.body.data })
        switch (req.body.action) {
            // JWT login
            case 'requestLoginChallenge':
                requestLoginChallenge(req, res)
                break
            case 'submitLoginChallenge':
                submitLoginChallenge(req, res)
                break
            case 'requestEthLoginChallenge':
                requestEthLoginChallenge(req, res)
                break
            case 'submitEthLoginChallenge':
                submitEthLoginChallenge(req, res)
                break
            case 'extendToken':
                extendToken(req, res)
                break
            // Sponsored tx
            case 'createProfile':
                applyJwtValidation(createProfile)(req, res)
                break
            case 'createPost':
                applyJwtValidation(createPost)(req, res)
                break
            case 'createComment':
                applyJwtValidation(createComment)(req, res)
                break
            case 'likePost':
                applyJwtValidation(likePost)(req, res)
                break
            case 'unlikePost':
                applyJwtValidation(unlikePost)(req, res)
                break
            case 'followProfile':
                applyJwtValidation(followProfile)(req, res)
                break
            case 'unfollowProfile':
                applyJwtValidation(unfollowProfile)(req, res)
                break
            case 'updateProfileImage':
                applyJwtValidation(updateProfileImage)(req, res)
                break
            case 'updateProfileCover':
                applyJwtValidation(updateProfileCover)(req, res)
                break
            case 'updateProfileDescription':
                applyJwtValidation(updateProfileDescription)(req, res)
                break
            // Firestore
            case 'fireStoreCreateProfile':
                applyJwtValidation(firestore.createProfile)(req, res)
                break
            case 'fireStoreCreatePost':
                applyJwtValidation(firestore.createPost)(req, res)
                break
            case 'fireStoreCreateComment':
                applyJwtValidation(firestore.createComment)(req, res)
                break
            case 'fireStoreFollowProfile':
                applyJwtValidation(firestore.followProfile)(req, res)
                break
            case 'fireStoreLikePost':
                applyJwtValidation(firestore.likePost)(req, res)
                break
            case 'fireStoreLikeComment':
                applyJwtValidation(firestore.likeComment)(req, res)
                break
            case 'fireStoreMintBadge':
                applyJwtValidation(firestore.mintBadge)(req, res)
                break
            case 'fireStoreCreateBadgeMint':
                applyJwtValidation(firestore.createBadgeMint)(req, res)
                break
            case 'fireStoreupdateLastViewedActivity':
                applyJwtValidation(firestore.updateLastActivity)(req, res)
                break
            case 'badgeMintEligibility':
                applyJwtValidation(firestore.badgeMintEligibility)(req, res)
                break
            // Twitter OAuth
            case 'requestTwitterOAuthCode':
                applyJwtValidation(oauth.requestTwitterOAuthCode)(req, res)
                break
            case 'connectTwitter':
                applyJwtValidation(oauth.connectTwitter)(req, res)
                break
            case 'connectDiscord':
                applyJwtValidation(oauth.connectDiscord)(req, res)
                break
            case 'disconnectTwitter':
                applyJwtValidation(oauth.disconnectTwitter)(req, res)
                break
            case 'submitQuest':
                applyJwtValidation(firestore.submitQuest)(req, res)
                break
            case 'updateQuestSubmission':
                applyJwtValidation(firestore.updateQuestSubmission)(req, res)
                break
            case 'verifyDiscordServer':
                discord.verifyDiscordServer({} as any, req, res)
                break
            default:
                throw new BadRequest('Unexpected action')
        }
    }),
)

export const twitterPosting = pubsub.schedule('*/5 * * * *').onRun(async () => {
    const profilesToScrap = await getTwitterScraperProfiles()
    await Promise.all(
        profilesToScrap.map(async (profile) => {
            const lastUpdate = profile.lastUpdate

            logger.info(`Scraping profiles: ${profile.twitter}, last update at ${lastUpdate}`)

            const response: ApifyTwitterRes[] = await scrapeTweets(profile.twitter)

            await updateLastScrape(profile.name, new Date().toISOString())

            await Promise.all(
                response.map(async (tweet) => {
                    if (new Date(tweet.created_at) > new Date(lastUpdate)) {
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
                            tweet.full_text.replace(/https:\/\/t\.co\S*/g, ''),
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
        }),
    )
})

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
