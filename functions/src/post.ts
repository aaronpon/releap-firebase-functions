import fetch from 'node-fetch'

import { Request } from 'firebase-functions/v2/https'
import { Response } from 'express'
import * as logger from 'firebase-functions/logger'
import { verfiyJwt } from './auth'
import { AppContext, TokenPayload } from './types'
import {
    JsonRpcProvider,
    RawSigner,
    Ed25519Keypair,
    TransactionBlock,
    SUI_CLOCK_OBJECT_ID,
    Connection,
} from '@mysten/sui.js'

globalThis.fetch = fetch as any

export function applyJwtValidation(handler: (ctx: AppContext, req: Request, res: Response) => Promise<void>) {
    return async (req: Request, res: Response) => {
        if (req.method !== 'POST') {
            res.status(403).send('Forbidden').end()
            return
        }

        const jwt = req.headers['authorization']
        if (jwt == null) {
            res.status(400).send('Missing authorization header').end()
            return
        }

        let publicKey
        let profiles
        try {
            const tokenPayload: TokenPayload = verfiyJwt(jwt, process.env.JWT_SECRET as string)
            if (tokenPayload.publicKey == null) {
                res.status(400).send('Invalid JWT').end()
                return
            }
            publicKey = tokenPayload.publicKey
            profiles = tokenPayload.profiles
        } catch (err) {
            res.status(400).send('Invaild JWT').end()
            return
        }
        let ctx: AppContext
        try {
            const keypair = Ed25519Keypair.deriveKeypair(process.env.SEED_PHRASE as string)
            const provider = new JsonRpcProvider(new Connection({ fullnode: 'https://sui-mainnet-rpc.nodereal.io' }))
            ctx = {
                publicKey,
                profiles,
                provider,
                signer: new RawSigner(keypair, provider),
                dappPackages: process.env.DAPP_PACKAGES?.split(',') ?? [],
                recentPosts: process.env.RECENT_POSTS as string,
                adminCap: process.env.ADMIN_CAP as string,
            }
        } catch (err) {
            res.status(500).send('Fail to create AppContext').end()
            return
        }

        await handler(ctx, req, res)
    }
}

export const createPost = async (ctx: AppContext, req: Request, res: Response) => {
    const { signer, profiles, dappPackages, adminCap, recentPosts } = ctx
    const { profile, imageUrl, content } = req.body.data

    if (!profiles.includes(profile)) {
        res.status(401).send("You don't own this profile").end()
        return
    }

    const tx = new TransactionBlock()

    tx.moveCall({
        target: `${dappPackages[0]}::releap_social::create_post_with_admin_cap`,
        typeArguments: [],
        arguments: [
            tx.object(profile),
            tx.object(adminCap),
            tx.object(recentPosts),
            tx.pure(imageUrl),
            tx.pure(content),
            tx.object(SUI_CLOCK_OBJECT_ID),
        ],
    })

    const { digest, errors, events, effects } = await signer.signAndExecuteTransactionBlock({
        transactionBlock: tx,
        options: { showEvents: true, showEffects: true },
    })

    if (errors) {
        logger.error('SuiTxError', errors)
    }

    res.status(201).json({ digest, events, effects })
}

export const createComment = async (ctx: AppContext, req: Request, res: Response) => {
    const { signer, profiles, dappPackages, adminCap, recentPosts } = ctx
    const { post, profile, content } = req.body.data

    if (!profiles.includes(profile)) {
        res.status(401).send("You don't own this profile").end()
        return
    }

    const tx = new TransactionBlock()

    tx.moveCall({
        target: `${dappPackages[0]}::releap_social::create_comment_with_admin_cap`,
        typeArguments: [],
        arguments: [
            tx.object(post),
            tx.object(profile),
            tx.object(adminCap),
            tx.object(recentPosts),
            tx.pure(content),
            tx.object(SUI_CLOCK_OBJECT_ID),
        ],
    })

    const { digest, errors, events, effects } = await signer.signAndExecuteTransactionBlock({
        transactionBlock: tx,
        options: { showEvents: true, showEffects: true },
    })

    if (errors) {
        logger.error('SuiTxError', errors)
    }

    res.status(201).json({ digest, events, effects })
}

export const likePost = async (ctx: AppContext, req: Request, res: Response) => {
    const { signer, profiles, dappPackages, adminCap } = ctx
    const { profile, post } = req.body.data

    if (!profiles.includes(profile)) {
        res.status(401).send("You don't own this profile").end()
        return
    }

    const tx = new TransactionBlock()

    tx.moveCall({
        target: `${dappPackages[0]}::releap_social::like_post_with_admin_cap`,
        typeArguments: [],
        arguments: [tx.object(post), tx.object(profile), tx.object(adminCap)],
    })

    const { digest, errors, events, effects } = await signer.signAndExecuteTransactionBlock({
        transactionBlock: tx,
        options: { showEvents: true, showEffects: true },
    })

    if (errors) {
        logger.error('SuiTxError', errors)
    }

    res.status(201).json({ digest, events, effects })
}

export const unlikePost = async (ctx: AppContext, req: Request, res: Response) => {
    const { signer, profiles, dappPackages, adminCap } = ctx
    const { profile, post } = req.body.data

    if (!profiles.includes(profile)) {
        res.status(401).send("You don't own this profile").end()
        return
    }

    const tx = new TransactionBlock()

    tx.moveCall({
        target: `${dappPackages[0]}::releap_social::unlike_post_with_admin_cap`,
        typeArguments: [],
        arguments: [tx.object(post), tx.object(profile), tx.object(adminCap)],
    })

    const { digest, errors, events, effects } = await signer.signAndExecuteTransactionBlock({
        transactionBlock: tx,
        options: { showEvents: true, showEffects: true },
    })

    if (errors) {
        logger.error('SuiTxError', errors)
    }

    res.status(201).json({ digest, events, effects })
}

export const followProfile = async (ctx: AppContext, req: Request, res: Response) => {
    const { signer, profiles, dappPackages, adminCap } = ctx
    const { followingProfile, profile } = req.body.data

    if (!profiles.includes(profile)) {
        res.status(401).send("You don't own this profile").end()
        return
    }

    const tx = new TransactionBlock()

    tx.moveCall({
        target: `${dappPackages[0]}::releap_social::follow_with_admin_cap`,
        typeArguments: [],
        arguments: [tx.object(followingProfile), tx.object(profile), tx.object(adminCap)],
    })

    const { digest, errors, events, effects } = await signer.signAndExecuteTransactionBlock({
        transactionBlock: tx,
        options: { showEvents: true, showEffects: true },
    })

    if (errors) {
        logger.error('SuiTxError', errors)
    }

    res.status(201).json({ digest, events, effects })
}

export const unfollowProfile = async (ctx: AppContext, req: Request, res: Response) => {
    const { signer, profiles, dappPackages, adminCap } = ctx
    const { followingProfile, profile } = req.body.data

    if (!profiles.includes(profile)) {
        res.status(401).send("You don't own this profile").end()
        return
    }

    const tx = new TransactionBlock()

    tx.moveCall({
        target: `${dappPackages[0]}::releap_social::unfollow_with_admin_cap`,
        typeArguments: [],
        arguments: [tx.object(followingProfile), tx.object(profile), tx.object(adminCap)],
    })

    const { digest, errors, events, effects } = await signer.signAndExecuteTransactionBlock({
        transactionBlock: tx,
        options: { showEvents: true, showEffects: true },
    })

    if (errors) {
        logger.error('SuiTxError', errors)
    }

    res.status(201).json({ digest, events, effects })
}
