import { randomUUID } from 'crypto'
import {
    IProposal,
    ICreateProposalRequest,
    IVote,
    ICreateVoteRequest,
    IVoting,
    ICreateVotingRequest,
    VoteQuery,
    VotingQuery,
    IRejectProposalRequest,
} from './types'
import { db, getDoc, getDocs, storeDoc } from '../firestore'
import { checkVeReapThreshold, getVeReapAmount, verifySignature } from './utils'
import { AuthError, BadRequest, NotFoundError } from '../error'
import { z } from 'zod'

export const GOVERNANCE_ADMIN = process.env.GOVERNANCE_ADMIN?.split(',') ?? [
    '0xf0da02c49b96f5ab2cf7529cdcb66161581b92b28c421c11692e097c26315151',
]

export async function createProposal(data: ICreateProposalRequest) {
    const signatureVerifed = verifySignature({
        data: {
            title: data.title,
            description: data.description,
            choices: data.choices,
            createdAt: data.createdAt,
            creator: data.creator,
        },
        chainId: data.chainId,
        wallet: data.creator,
        signature: data.signature,
    })

    if (!signatureVerifed) {
        throw new BadRequest('Invalid signature')
    }

    if (!(await checkVeReapThreshold(data.chainId, data.creator))) {
        throw new BadRequest("You don't have enough veReap")
    }

    const proposal: IProposal = {
        ...data,
        proposalId: randomUUID(),
        choices: data.choices.map((choice) => {
            return {
                choiceId: randomUUID(),
                ...choice,
            }
        }),
    }

    await storeDoc<IProposal>('proposal', proposal.proposalId, proposal)

    return proposal
}

export async function rejectProposal(data: IRejectProposalRequest) {
    const signatureVerifed = verifySignature({
        data: {
            proposalId: data.proposalId,
            createdAt: data.createdAt,
            creator: data.creator,
        },
        chainId: data.chainId,
        wallet: data.creator,
        signature: data.signature,
    })

    if (!signatureVerifed) {
        throw new BadRequest('Invalid signature')
    }

    if (!GOVERNANCE_ADMIN.includes(data.creator)) {
        throw new AuthError('Access denied')
    }

    const proposal = await getDoc<IProposal>('proposal', data.proposalId)

    proposal.rejected = true

    await storeDoc<IProposal>('proposal', data.proposalId, proposal)

    return proposal
}

export async function createVoting(votingInput: ICreateVotingRequest) {
    const signatureVerifed = verifySignature({
        data: {
            proposalId: votingInput.proposalId,
        },
        chainId: votingInput.chainId,
        wallet: votingInput.creator,
        signature: votingInput.signature,
    })

    if (!signatureVerifed) {
        throw new BadRequest('Invalid signature')
    }

    if (!GOVERNANCE_ADMIN.includes(votingInput.creator)) {
        throw new AuthError('Access denied')
    }

    const proposal = await getDoc<IProposal>('proposal', votingInput.proposalId)

    if (proposal == null) {
        throw new NotFoundError('Proposal not found')
    }

    const voting: IVoting = {
        ...votingInput,
        proposal,
    }

    await storeDoc<IVoting>('voting', votingInput.proposalId, voting)

    return voting
}

export async function createVote(data: ICreateVoteRequest) {
    const votedAt = Date.now()
    const proposal = await getDoc<IProposal>('proposal', data.proposalId)

    if (proposal == null) {
        throw new NotFoundError('Proposal not found')
    }

    if (!proposal.choices.some((choice) => choice.choiceId === data.choiceId && choice.title === data.choiceTitle)) {
        throw new BadRequest('Invalid choiceId')
    }

    const voting = await getDoc<IVoting>('voting', data.proposalId)

    if (votedAt < voting.startTime) {
        throw new BadRequest('Voting is not started')
    }

    if (votedAt > voting.endTime) {
        throw new BadRequest('Voting is ended')
    }

    const existingVote = await getDoc<IVote>('vote', `${data.proposalId}.${data.walletAddress}`)

    if (existingVote != null) {
        throw new BadRequest('Your already voted')
    }

    const signatureVerifed = verifySignature({
        data: {
            proposalId: data.proposalId,
            choiceId: data.choiceId,
            choiceTitle: data.choiceTitle,
            signedAt: data.signedAt,
            walletAddress: data.walletAddress,
        },
        chainId: data.chainId,
        wallet: data.walletAddress,
        signature: data.signature,
    })

    if (!signatureVerifed) {
        throw new BadRequest('Invalid signature')
    }

    const vote: IVote = {
        ...data,
        votedAt,
        veReapAmount: await getVeReapAmount(data.chainId, data.walletAddress),
    }

    if (vote.veReapAmount === 0) {
        throw new BadRequest("You don't have VeReap to vote")
    }

    const ref = db.collection('voting').doc(data.proposalId)

    await db.runTransaction(
        async (tx) => {
            const voting = (await tx.get(ref)).data() as IVoting
            voting.proposal.choices.forEach((choice) => {
                if (choice.choiceId === data.choiceId) {
                    choice.veReap = (choice.veReap ?? 0) + vote.veReapAmount
                    choice.voter = (choice.voter ?? 0) + 1
                }
            })
            tx.set(ref, voting)
            tx.set(db.collection('vote').doc(`${vote.proposalId}.${vote.walletAddress}`), vote)
        },
        { maxAttempts: 100 },
    )

    return vote
}

export async function getVotings(query: z.infer<typeof VotingQuery>) {
    const { skip, limit } = query
    const votings = await getDocs<IVoting>('voting', {
        orderBy: 'createdAt',
        descending: true,
        skip,
        limit,
    })
    return votings
}

export async function getVoting(id: string) {
    const voting = await getDoc<IVoting>('voting', id)
    return voting
}

export async function getVotes(query: z.infer<typeof VoteQuery>) {
    const { proposalId, skip, limit } = query
    const votes = await getDocs<IVote>('vote', {
        filters: [{ path: 'proposalId', ops: '==', value: proposalId }],
        orderBy: 'votedAt',
        descending: true,
        skip,
        limit,
    })
    return votes
}
