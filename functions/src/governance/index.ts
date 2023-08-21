import { onRequest } from 'firebase-functions/v2/https'

import {
    GOVERNANCE_ADMIN,
    createProposal,
    createVote,
    createVoting,
    getVotes,
    getVoting,
    getVotings,
    rejectProposal,
} from './functions'
import { commonOnRequestSettings, requestParser } from '../utils'
import { CreateVoteRequest, VoteQuery, CreateVotingRequest, VotingQuery, RejectProposalRequest } from './types'
import express from 'express'
import { CreateProposalRequest } from './types'
import { z } from 'zod'

const app = express()

app.post(
    '/proposals',
    requestParser({ body: CreateProposalRequest }, async (data) => {
        return await createProposal(data.body)
    }),
)

app.post(
    '/proposals/reject',
    requestParser({ body: RejectProposalRequest }, async (data) => {
        return await rejectProposal(data.body)
    }),
)

app.post(
    '/votings',
    requestParser({ body: CreateVotingRequest }, async (data) => {
        return await createVoting(data.body)
    }),
)

app.post(
    '/votes',
    requestParser({ body: CreateVoteRequest }, async (data) => {
        return await createVote(data.body)
    }),
)

app.get(
    '/votes',
    requestParser({ query: VoteQuery }, async (payload) => {
        return await getVotes(payload.query)
    }),
)

app.get(
    '/votings',
    requestParser({ query: VotingQuery }, async (payload) => {
        return await getVotings(payload.query)
    }),
)

app.get(
    '/votings/:votingId',
    requestParser({ params: z.object({ votingId: z.string() }) }, async (payload) => {
        return await getVoting(payload.params.votingId)
    }),
)

app.get(
    '/admin',
    requestParser({}, async () => {
        return GOVERNANCE_ADMIN
    }),
)

export const governance = onRequest(commonOnRequestSettings, app)
