import { onRequest } from 'firebase-functions/v2/https'

import * as logger from 'firebase-functions/logger'
import { createProposal, createVote, createVoting, getVotes, getVotings } from './functions'
import { commonOnRequestSettings, requestParser } from '../utils'
import { GovernanceRequest, VoteQuery, VotingQuery } from './types'

export const governance = onRequest(
    commonOnRequestSettings,
    requestParser({ body: GovernanceRequest }, async (payload) => {
        const { action, data } = payload.body
        logger.info(`Action: ${action}`, { payload })
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
    requestParser({ query: VotingQuery }, async (payload) => {
        return await getVotings(payload.query)
    }),
)

export const votes = onRequest(
    commonOnRequestSettings,
    requestParser({ query: VoteQuery }, async (payload) => {
        return await getVotes(payload.query)
    }),
)
