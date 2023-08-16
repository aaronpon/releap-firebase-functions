import * as z from 'zod'

export const Choice = z.object({
    title: z.string(),
    description: z.string(),
    choiceId: z.string(),
    veReap: z.number().optional(),
    voter: z.number().optional(),
})

export const ChoiceInput = Choice.extend({
    choiceId: z.string().optional(),
})

export const Proposal = z.object({
    proposalId: z.string(),
    title: z.string(),
    description: z.string(),
    createdAt: z.number(),
    choices: Choice.array(),
    creator: z.string(),
    chainId: z.string().or(z.number()),
    signature: z.string(),
})

export const ProposalInput = Proposal.extend({
    proposalId: z.string().optional(),
    choices: ChoiceInput.array(),
})

export const Voting = z.object({
    proposal: Proposal,
    quorum: z.number(),
    startTime: z.number(),
    endTime: z.number(),
    creator: z.string(),
    createdAt: z.number(),
    chainId: z.string().or(z.number()),
    signature: z.string(),
})

export const Vote = z.object({
    proposalId: z.string(),
    votedAt: z.number(),
    signedAt: z.number(),
    choiceId: z.string(),
    choiceTitle: z.string(),
    walletAddress: z.string(),
    veReapAmount: z.number(),
    chainId: z.string().or(z.number()),
    signature: z.string(),
})

export const VoteInput = Vote.extend({ veReapAmount: z.undefined(), votedAt: z.undefined() })
export const VotingInput = Voting.extend({ proposal: z.undefined(), proposalId: z.string() })

export const GovernanceRequest = z.union([
    z.object({
        action: z.literal('createProposal'),
        data: ProposalInput,
    }),
    z.object({
        action: z.literal('createVoting'),
        data: VotingInput,
    }),
    z.object({
        action: z.literal('createVote'),
        data: VoteInput,
    }),
])

export const VotingQuery = z.object({
    id: z.string().optional(),
    skip: z.number().gte(0).default(0),
    limit: z.number().lte(20).default(20),
})

export const VoteQuery = z.object({
    proposalId: z.string(),
    skip: z.number().gte(0).default(0),
    limit: z.number().lte(20).default(20),
})

export type IProposalInput = z.infer<typeof ProposalInput>
export type IProposal = z.infer<typeof Proposal>
export type IVoting = z.infer<typeof Voting>
export type IVotingInput = z.infer<typeof VotingInput>
export type IVote = z.infer<typeof Vote>
export type IVoteInput = z.infer<typeof VoteInput>
