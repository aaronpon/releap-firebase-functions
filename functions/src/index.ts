import { onRequest } from 'firebase-functions/v2/https'
import { pubsub } from 'firebase-functions'
import * as logger from 'firebase-functions/logger'
import { extendToken, requestLoginChallenge, submitLoginChallenge } from './auth'
import {
    applyJwtValidation,
    createPost,
    createComment,
    likePost,
    unlikePost,
    followProfile,
    unfollowProfile,
    adminCreatePost,
} from './post'
import { getTwitterScraperProfiles, updateLastScrap as updateLastScrape } from './firestore'
import { scrapeProfile as scrapeTweets } from './api'
import { ApifyTwitterRes } from './types'
import admin from 'firebase-admin'

export { taskCreated, flagsUpdated } from './task'

export const entrypoint = onRequest(
    {
        secrets: ['JWT_SECRET'],
        cors: [/localhost/, /.*\.releap\.xyz$/, /localhost:3000/, /feat-auth.d1doiqjkpgeoca.amplifyapp.com/],
    },
    async (req, res) => {
        if (req.method === 'OPTIONS') {
            res.status(200).end()
            return
        }

        logger.info(`Action: ${req.body.action}`, { data: req.body.data })
        switch (req.body.action) {
            case 'requestLoginChallenge':
                requestLoginChallenge(req, res)
                break
            case 'submitLoginChallenge':
                submitLoginChallenge(req, res)
                break
            case 'extendToken':
                extendToken(req, res)
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
            default:
                res.status(400).send('Unexpected action').end()
        }
    },
)

export const twitterPosting = pubsub.schedule('*/15 * * * *').onRun(async () => {
    const profilesToScrap = await getTwitterScraperProfiles()
    await Promise.all(
        profilesToScrap.map(async (profile) => {
            const lastUpdate = profile.lastUpdate

            logger.info(`Scraping profiles: ${profile.twitter}, last update at ${lastUpdate}`)

            const response: ApifyTwitterRes[] = await scrapeTweets(profile.twitter)

            await Promise.all(
                response.map(async (tweet) => {
                    if (new Date(tweet.created_at) > new Date(lastUpdate)) {
                        logger.info(`Got Tweet profiles: ${profile.twitter}, ${tweet.full_text}`)
                        const res: any = await adminCreatePost(
                            profile.profileId,
                            tweet.media[0]?.media_url ?? null,
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

            await updateLastScrape(profile.name, new Date().toISOString())
        }),
    )
})
