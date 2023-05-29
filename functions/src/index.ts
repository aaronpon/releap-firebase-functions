import { onRequest } from 'firebase-functions/v2/https'
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
} from './post'

export const entrypoint = onRequest(
    { secrets: ['JWT_SECRET', 'SEED_PHRASE'], cors: [/localhost/, /.*\.releap\.xyz$/] },
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
