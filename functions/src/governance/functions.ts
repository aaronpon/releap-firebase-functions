import { Request } from 'firebase-functions/v2/https'
import { Response } from 'express'
import { randomUUID } from 'crypto'
import { IProposal, IVote, IVoting, IVotingInput, ProposalInput, VoteInput, VotingInput } from './types'
import { getDoc, getDocs, storeDoc } from '../firestore'
import { checkVeReapThreshold, getVeReapAmount, verifySignature } from './utils'

const GOVERNANCE_ADMIN = process.env.GOVERNANCE_ADMIN?.split(',') ?? []

export async function createProposal(req: Request, res: Response) {
    const result = await ProposalInput.safeParseAsync(req.body.data)

    if (!result.success) {
        res.status(400).send(result.error.message)
        return
    }

    const data = result.data

    const signatureVerifed = verifySignature({
        data: {},
        chainId: data.chainId,
        wallet: data.creator,
        signature: data.signature,
    })

    if (!signatureVerifed) {
        res.status(400).send('Invalid signature')
        return
    }

    if (!(await checkVeReapThreshold(data.chainId, data.creator))) {
        res.status(400).send("You don't have enough veReap")
        return
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
}

export async function createVoting(req: Request, res: Response) {
    const result = await VotingInput.safeParseAsync(req.body.data)

    if (!result.success) {
        res.status(400).send(result.error.message)
        return
    }

    const votingInput: IVotingInput = {
        ...result.data,
    }

    const signatureVerifed = verifySignature({
        data: {
            proposalId: votingInput.proposalId,
        },
        chainId: votingInput.chainId,
        wallet: votingInput.creator,
        signature: votingInput.signature,
    })

    if (!signatureVerifed) {
        res.status(400).send('Invalid signature')
        return
    }

    if (!GOVERNANCE_ADMIN.includes(votingInput.creator)) {
        res.status(401).send('Access denied')
        return
    }

    const proposal = await getDoc<IProposal>('proposal', votingInput.proposalId)

    if (proposal == null) {
        res.status(400).send('Proposal not found')
        return
    }

    const voting: IVoting = {
        ...votingInput,
        proposal,
    }

    await storeDoc<IVoting>('voting', votingInput.proposalId, voting)
}

export async function getVotings(req: Request, res: Response) {
    const { id, skip, limit } = req.query
    if (id && typeof id === 'string') {
        const voting = await getDoc<IVoting>('voting', id)
        res.json([voting])
    } else {
        const skipStr = typeof skip === 'string' ? skip : '0'
        const limitStr = typeof limit === 'string' ? limit : '20'
        const skip_ = parseInt(skipStr)
        const limit_ = Math.min(20, parseInt(limitStr))
        const votings = await getDocs<IVoting>('voting', {
            orderBy: 'createdAt',
            descending: true,
            skip: skip_,
            limit: limit_,
        })
        res.json(votings)
    }
}

export async function getVotes(req: Request, res: Response) {
    const { proposalId, skip, limit } = req.query
    const skipStr = typeof skip === 'string' ? skip : '0'
    const limitStr = typeof limit === 'string' ? limit : '20'
    const skip_ = parseInt(skipStr)
    const limit_ = Math.min(20, parseInt(limitStr))
    const votes = await getDocs<IVote>('vote', {
        filters: [{ path: 'proposalId', ops: '==', value: proposalId }],
        orderBy: 'votedAt',
        descending: true,
        skip: skip_,
        limit: limit_,
    })
    res.json(votes)
}

export async function createVote(req: Request, res: Response) {
    const result = await VoteInput.safeParseAsync(req.body.data)

    if (!result.success) {
        res.status(400).send(result.error.message)
        return
    }

    const data = result.data

    const votedAt = Date.now()
    const proposal = await getDoc<IProposal>('proposal', data.proposalId)

    if (proposal == null) {
        res.status(404).send('Invalid proposalId')
        return
    }

    if (!proposal.choices.some((choice) => choice.choiceId === data.choiceId)) {
        res.status(400).send('Invalid choiceId')
        return
    }

    const voting = await getDoc<IVoting>('voting', data.proposalId)

    if (votedAt < voting.startTime) {
        res.status(400).send('Voting is not started')
        return
    }

    if (votedAt > voting.endTime) {
        res.status(400).send('Voting is ended')
        return
    }

    const existingVote = await getDoc<IVote>('vote', `${data.proposalId}.${data.walletAddress}`)

    if (existingVote != null) {
        res.status(400).send('Your already voted')
        return
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
        res.status(400).send('Invalid signature')
        return
    }

    const vote: IVote = {
        ...data,
        votedAt,
        veReapAmount: await getVeReapAmount(data.chainId, data.walletAddress),
    }

    if (vote.veReapAmount === 0) {
        res.status(400).send("You don't have VeReap to vote")
        return
    }

    await storeDoc<IVote>('vote', `${vote.proposalId}.${vote.walletAddress}`, vote)
}
