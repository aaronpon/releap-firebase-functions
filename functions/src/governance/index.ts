import { onRequest } from 'firebase-functions/v2/https'

import { createProposal, createVote, createVoting, getVotes, getVoting, getVotings } from './functions'
import { commonOnRequestSettings, requestParser } from '../utils'
import { VoteInput, VoteQuery, VotingInput, VotingQuery } from './types'
import express from 'express'
import { ProposalInput } from './types'
import { z } from 'zod'

const app = express()

app.post(
    '/proposals',
    requestParser({ body: ProposalInput }, async (data) => {
        return await createProposal(data.body)
    }),
)

app.post(
    '/votings',
    requestParser({ body: VotingInput }, async (data) => {
        return await createVoting(data.body)
    }),
)

app.post(
    '/votes',
    requestParser({ body: VoteInput }, async (data) => {
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

export const governance = onRequest(commonOnRequestSettings, app)
