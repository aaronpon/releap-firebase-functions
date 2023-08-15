import { onRequest } from 'firebase-functions/v2/https'

import * as logger from 'firebase-functions/logger'
import { createProposal, createVote, createVoting, getVotes, getVotings } from './functions'
import { BadRequest } from '../error'
import { errorCaptured } from '../utils'

export const governance = onRequest(
    {
        cors: [/localhost/, /.*\.releap\.xyz$/, /localhost:3000/, /.*\.d1doiqjkpgeoca\.amplifyapp\.com/],
        timeoutSeconds: 180,
    },
    errorCaptured(async (req, res) => {
        logger.info(`Action: ${req.body.action}`, { data: req.body.data })
        switch (req.body.action) {
            case 'createProposal':
                await createProposal(req, res)
                break
            case 'createVoting':
                // admin only
                await createVoting(req, res)
                break
            case 'createVote':
                await createVote(req, res)
                break
            default:
                throw new BadRequest('Unexpected action')
        }
    }),
)

export const votings = onRequest(
    {
        cors: [/localhost/, /.*\.releap\.xyz$/, /localhost:3000/, /.*\.d1doiqjkpgeoca\.amplifyapp\.com/],
        timeoutSeconds: 180,
    },
    errorCaptured(async (req, res) => {
        await getVotings(req, res)
    }),
)

export const votes = onRequest(
    {
        cors: [/localhost/, /.*\.releap\.xyz$/, /localhost:3000/, /.*\.d1doiqjkpgeoca\.amplifyapp\.com/],
        timeoutSeconds: 180,
    },
    errorCaptured(async (req, res) => {
        await getVotes(req, res)
    }),
)
