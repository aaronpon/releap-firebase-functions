import { onRequest } from 'firebase-functions/v2/https'

import * as logger from 'firebase-functions/logger'
import { createProposal, createVote, createVoting, getVotes, getVotings } from './functions'
import { commonOnRequestSettings, parseRequestBody, parseRequestQuery } from '../utils'
import { GovernanceRequest, VoteQuery, VotingQuery } from './types'

export const governance = onRequest(
    commonOnRequestSettings,
    parseRequestBody(GovernanceRequest, async (req, payload) => {
        logger.info(`Action: ${req.body.action}`, { data: req.body.data })
        const { action, data } = payload
        switch (action) {
            case 'createProposal':
                return await createProposal(data)
            case 'createVoting':
                // admin only
                return await createVoting(data)
            case 'createVote':
                return await createVote(data)
        }
    }),
)

export const votings = onRequest(
    commonOnRequestSettings,
    parseRequestQuery(VotingQuery, async (req, query) => {
        return await getVotings(query)
    }),
)

export const votes = onRequest(
    commonOnRequestSettings,
    parseRequestQuery(VoteQuery, async (req, query) => {
        return await getVotes(query)
    }),
)
