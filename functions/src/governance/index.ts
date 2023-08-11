import { onRequest } from 'firebase-functions/v2/https'

import * as logger from 'firebase-functions/logger'
import { createProposal, createVote, getVotes, getVotings } from './functions'

export const governance = onRequest(
    {
        cors: [/localhost/, /.*\.releap\.xyz$/, /localhost:3000/, /.*\.d1doiqjkpgeoca\.amplifyapp\.com/],
        timeoutSeconds: 180,
    },
    async (req, res) => {
        if (req.method === 'OPTIONS') {
            res.status(200).end()
            return
        }

        logger.info(`Action: ${req.body.action}`, { data: req.body.data })
        switch (req.body.action) {
            case 'createProposal':
                createProposal(req, res)
                break
            // admin only
            case 'createVoting':
                createProposal(req, res)
                break
            case 'createVote':
                createVote(req, res)
                break

            default:
                res.status(400).send('Unexpected action').end()
        }
    },
)

export const votings = onRequest(
    {
        cors: [/localhost/, /.*\.releap\.xyz$/, /localhost:3000/, /.*\.d1doiqjkpgeoca\.amplifyapp\.com/],
        timeoutSeconds: 180,
    },
    async (req, res) => {
        if (req.method === 'OPTIONS') {
            res.status(200).end()
            return
        }
        getVotings(req, res)
    },
)

export const votes = onRequest(
    {
        cors: [/localhost/, /.*\.releap\.xyz$/, /localhost:3000/, /.*\.d1doiqjkpgeoca\.amplifyapp\.com/],
        timeoutSeconds: 180,
    },
    async (req, res) => {
        if (req.method === 'OPTIONS') {
            res.status(200).end()
            return
        }
        getVotes(req, res)
    },
)
