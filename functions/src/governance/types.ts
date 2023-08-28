import * as z from 'zod'

export const numericString = (schema: z.ZodTypeAny) =>
    z.preprocess((a) => {
        if (typeof a === 'string') {
            return parseInt(a, 10)
        } else if (typeof a === 'number') {
            return a
        } else {
            return undefined
        }
    }, schema)

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

export const ProposalStatus = z.enum(['unlisted', 'rejected', 'listed']).default('unlisted')

export const Proposal = z.object({
    proposalId: z.string(),
    title: z.string(),
    description: z.string(),
    discussion: z.string().optional(),
    createdAt: z.number(),
    choices: Choice.array(),
    creator: z.string(),
    chainId: z.string().or(z.number()),
    signature: z.string(),
    rejected: z.boolean().optional().default(false),
    status: ProposalStatus,
})

export const CreateProposalRequest = Proposal.extend({
    proposalId: z.string().optional(),
    choices: ChoiceInput.array(),
    status: z.undefined(),
})

export const RejectProposalRequest = z.object({
    proposalId: z.string(),
    chainId: z.string().or(z.number()),
    creator: z.string(),
    createdAt: z.number(),
    signature: z.string(),
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

export const CreateVoteRequest = Vote.extend({ veReapAmount: z.undefined(), votedAt: z.undefined() })
export const CreateVotingRequest = Voting.extend({ proposal: z.undefined(), proposalId: z.string() })

export const ProposalQuery = z.object({
    status: ProposalStatus.optional(),
    skip: numericString(z.number().gte(0).default(0)),
    limit: numericString(z.number().lte(20).default(20)),
})

export const VotingQuery = z.object({
    skip: numericString(z.number().gte(0).default(0)),
    limit: numericString(z.number().lte(20).default(20)),
})

export const VoteQuery = z.object({
    proposalId: z.string(),
    skip: numericString(z.number().gte(0).default(0)),
    limit: numericString(z.number().lte(20).default(20)),
})

export type ICreateProposalRequest = z.infer<typeof CreateProposalRequest>
export type IRejectProposalRequest = z.infer<typeof RejectProposalRequest>
export type IProposal = z.infer<typeof Proposal>
export type IVoting = z.infer<typeof Voting>
export type ICreateVotingRequest = z.infer<typeof CreateVotingRequest>
export type IVote = z.infer<typeof Vote>
export type ICreateVoteRequest = z.infer<typeof CreateVoteRequest>
