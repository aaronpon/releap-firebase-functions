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
    ProposalQuery,
} from './types'
import { db, getDoc, getDocs, storeDoc, getCountFromServer } from '../firestore'
import { checkVeReapThreshold, getVeReapAmount, verifySignature } from './utils'
import { AuthError, BadRequest, NotFoundError } from '../error'
import { z } from 'zod'
import { DocFilters } from '../types'
import { ADMIN } from '../auth'

export async function createProposal(data: ICreateProposalRequest) {
    const signatureVerifed = await verifySignature({
        data: {
            title: data.title,
            description: data.description,
            choices: data.choices,
            signAt: data.signInfo.signAt,
        },
        signInfo: data.signInfo,
    })

    if (!signatureVerifed) {
        throw new BadRequest('Invalid signature')
    }

    if (!(await checkVeReapThreshold(data.signInfo.chainId, data.signInfo.signer))) {
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
        status: 'unlisted',
        createdAt: Date.now(),
    }

    await storeDoc<IProposal>('proposal', proposal.proposalId, proposal)

    return proposal
}

export async function rejectProposal(data: IRejectProposalRequest, proposalId: string) {
    const signatureVerifed = await verifySignature({
        data: {
            proposalId: proposalId,
            signAt: data.signInfo.signAt,
        },
        signInfo: data.signInfo,
    })

    if (!signatureVerifed) {
        throw new BadRequest('Invalid signature')
    }

    if (!ADMIN.includes(data.signInfo.signer)) {
        throw new AuthError('Access denied')
    }

    const proposal = await getDoc<IProposal>('proposal', proposalId)

    proposal.rejected = true
    proposal.status = 'rejected'

    await storeDoc<IProposal>('proposal', proposalId, proposal)

    return proposal
}

export async function createVoting(votingInput: ICreateVotingRequest) {
    const signatureVerifed = await verifySignature({
        data: {
            proposalId: votingInput.proposalId,
            signAt: votingInput.signInfo.signAt,
        },
        signInfo: votingInput.signInfo,
    })

    if (!signatureVerifed) {
        throw new BadRequest('Invalid signature')
    }

    if (!ADMIN.includes(votingInput.signInfo.signer)) {
        throw new AuthError('Access denied')
    }

    const proposal = await getDoc<IProposal>('proposal', votingInput.proposalId)

    if (proposal == null) {
        throw new NotFoundError('Proposal not found')
    }

    if (proposal.status === 'listed') {
        throw new BadRequest('Proposal incorrect status')
    }

    proposal.status = 'listed'

    const voting: IVoting = {
        ...votingInput,
        votingId: randomUUID(),
        proposal,
        createdAt: Date.now(),
    }

    await storeDoc<IProposal>('proposal', votingInput.proposalId, proposal)
    await storeDoc<IVoting>('voting', voting.votingId, voting)

    return voting
}

export async function createVote(data: ICreateVoteRequest) {
    const votedAt = Date.now()

    const voting = await getDoc<IVoting>('voting', data.votingId)
    if (voting == null) {
        throw new NotFoundError('Voting not found')
    }

    if (
        !voting.proposal.choices.some(
            (choice) => choice.choiceId === data.choiceId && choice.title === data.choiceTitle,
        )
    ) {
        throw new BadRequest('Invalid choiceId')
    }

    if (votedAt < voting.startTime) {
        throw new BadRequest('Voting is not started')
    }

    if (votedAt > voting.endTime) {
        throw new BadRequest('Voting is ended')
    }

    const existingVote = await getDoc<IVote>('vote', `${data.votingId}.${data.signInfo.signer}`)

    if (existingVote != null) {
        throw new BadRequest('Your already voted')
    }

    const signatureVerifed = await verifySignature({
        data: {
            proposalId: data.votingId,
            choiceId: data.choiceId,
            choiceTitle: data.choiceTitle,
            signAt: data.signInfo.signAt,
        },
        signInfo: data.signInfo,
    })

    if (!signatureVerifed) {
        throw new BadRequest('Invalid signature')
    }

    const vote: IVote = {
        ...data,
        votedAt,
        veReapAmount: await getVeReapAmount(data.signInfo.chainId, data.signInfo.signer),
    }

    if (vote.veReapAmount === 0) {
        throw new BadRequest("You don't have VeReap to vote")
    }

    const ref = db.collection('voting').doc(data.votingId)

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
            tx.set(db.collection('vote').doc(`${vote.votingId}.${vote.signInfo.signer}`), vote)
        },
        { maxAttempts: 100 },
    )

    return vote
}

export async function getProposals(query: z.infer<typeof ProposalQuery>) {
    const { skip, limit, status } = query
    const filters: DocFilters<IProposal> = status != null ? [{ path: 'status', ops: '==', value: status }] : undefined

    const votings = await getDocs<IProposal>('proposal', {
        orderBy: 'createdAt',
        descending: true,
        filters,
        skip,
        limit,
    })

    return votings
}

export async function getTotalProposals() {
    const totalProposals = await getCountFromServer<IProposal>('proposal', {})

    return totalProposals
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
    const { votingId, voter, skip, limit } = query
    const filters: DocFilters<IVote> = [{ path: 'votingId', ops: '==', value: votingId }]
    if (voter != null) {
        filters.push({ path: 'signInfo.signer', ops: '==', value: voter })
    }
    const votes = await getDocs<IVote>('vote', {
        filters,
        orderBy: 'votedAt',
        descending: true,
        skip,
        limit,
    })
    return votes
}
