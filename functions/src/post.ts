import fetch from 'node-fetch'

import { Request } from 'firebase-functions/v2/https'
import { Response } from 'express'
import { verfiyJwt } from './auth'

// The Firebase Admin SDK to access the Firebase Realtime Database.
import admin from 'firebase-admin'
admin.initializeApp()

import { RequestContext, TaskRequest, TaskResponse, TokenPayload } from './types'
import { obj2Arr, RPC } from './utils'
import { Connection, JsonRpcProvider } from '@mysten/sui.js'

globalThis.fetch = fetch as any

export function applyJwtValidation(handler: (ctx: RequestContext, req: Request, res: Response) => Promise<void>) {
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
        let ctx: RequestContext
        try {
            ctx = {
                publicKey,
                profiles,
                dappPackages: process.env.DAPP_PACKAGES?.split(',') ?? [],
                recentPosts: process.env.RECENT_POSTS as string,
                adminCap: process.env.ADMIN_CAP as string,
                provider: new JsonRpcProvider(new Connection({ fullnode: RPC })),
            }
        } catch (err) {
            res.status(500).send('Fail to create AppContext').end()
            return
        }

        await handler(ctx, req, res)
    }
}

export const createPost = async (ctx: RequestContext, req: Request, res: Response) => {
    const { profiles } = ctx
    const { profile, imageUrl, content } = req.body.data
    if (!profiles.includes(profile)) {
        res.status(401).send("You don't own this profile").end()
        return
    }

    const task: TaskRequest = {
        data: {
            action: 'createPost',
            payload: { profile, imageUrl, content },
        },
    }
    const { key } = await admin.database().ref('/tasks').push(task)
    const result = await waitTask(key as string)
    res.status(201).json(result)
}

export const adminCreatePost = async (profile: string, imageUrl: string, content: string) => {
    const task: TaskRequest = {
        data: {
            action: 'createPost',
            payload: { profile, imageUrl, content },
        },
    }
    const { key } = await admin.database().ref('/tasks').push(task)
    const result = await waitTask(key as string)
    return result
}

export const createComment = async (ctx: RequestContext, req: Request, res: Response) => {
    const { profiles } = ctx
    const { post, profile, content } = req.body.data

    if (!profiles.includes(profile)) {
        res.status(401).send("You don't own this profile").end()
        return
    }

    const task: TaskRequest = {
        data: {
            action: 'createComment',
            payload: { profile, post, content },
        },
    }
    const { key } = await admin.database().ref('/tasks').push(task)
    const result = await waitTask(key as string)
    res.status(201).json(result)
}

export const likePost = async (ctx: RequestContext, req: Request, res: Response) => {
    const { profiles } = ctx
    const { profile, post } = req.body.data

    if (!profiles.includes(profile)) {
        res.status(401).send("You don't own this profile").end()
        return
    }

    const task: TaskRequest = {
        data: {
            action: 'likePost',
            payload: { profile, post },
        },
    }
    const { key } = await admin.database().ref('/tasks').push(task)
    const result = await waitTask(key as string)
    res.status(201).json(result)
}

export const unlikePost = async (ctx: RequestContext, req: Request, res: Response) => {
    const { profiles } = ctx
    const { profile, post } = req.body.data

    if (!profiles.includes(profile)) {
        res.status(401).send("You don't own this profile").end()
        return
    }

    const task: TaskRequest = {
        data: {
            action: 'unlikePost',
            payload: { profile, post },
        },
    }
    const { key } = await admin.database().ref('/tasks').push(task)
    const result = await waitTask(key as string)
    res.status(201).json(result)
}

export const followProfile = async (ctx: RequestContext, req: Request, res: Response) => {
    const { profiles } = ctx
    const { followingProfile, profile } = req.body.data

    if (!profiles.includes(profile)) {
        res.status(401).send("You don't own this profile").end()
        return
    }
    const task: TaskRequest = {
        data: {
            action: 'followProfile',
            payload: { profile, followingProfile },
        },
    }
    const { key } = await admin.database().ref('/tasks').push(task)
    const result = await waitTask(key as string)
    res.status(201).json(result)
}

export const unfollowProfile = async (ctx: RequestContext, req: Request, res: Response) => {
    const { profiles } = ctx
    const { followingProfile, profile } = req.body.data

    if (!profiles.includes(profile)) {
        res.status(401).send("You don't own this profile").end()
        return
    }

    const task: TaskRequest = {
        data: {
            action: 'unfollowProfile',
            payload: { profile, followingProfile },
        },
    }
    const { key } = await admin.database().ref('/tasks').push(task)
    const result = await waitTask(key as string)
    res.status(201).json(result)
}

async function waitTask(taskId: string) {
    while (true) {
        const taskRes = await admin.database().ref(`/tasks_res/${taskId}`).once('value')
        const json = taskRes.toJSON() as unknown as TaskResponse | undefined
        if (json != null) {
            await admin.database().ref(`/tasks_res/${taskId}`).remove()
            return obj2Arr(json)
        }
    }
}
