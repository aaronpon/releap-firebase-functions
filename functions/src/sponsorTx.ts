import fetch from 'node-fetch'

import { Request } from 'firebase-functions/v2/https'
import { Response } from 'express'

// The Firebase Admin SDK to access the Firebase Realtime Database.
import admin from 'firebase-admin'
admin.initializeApp()

import { RequestContext, TaskRequest, TaskResponse } from './types'
import { obj2Arr, sleep } from './utils'
import { getDoc, storeDoc } from './firestore'

globalThis.fetch = fetch as any

export const createProfile = async (ctx: RequestContext, req: Request, res: Response) => {
    const { isEth, publicKey, provider, profileTable } = ctx
    const { profileName } = req.body.data

    const task: TaskRequest = {
        data: {
            action: 'createProfile',
            payload: { profileName },
        },
    }
    const { key } = await admin.database().ref('/tasks').push(task)
    const result = await waitTask(key as string)

    if (isEth) {
        // store the eth wallet <-> profile mapping off-chain
        await sleep(2000)
        const df = await provider.getDynamicFieldObject({
            parentId: profileTable,
            name: { type: '0x1::string::String', value: profileName },
        })

        const profile = df.data?.content?.dataType === 'moveObject' && df.data.content.fields.value

        if (profile != null) {
            const ethProfile = (await getDoc<{ ethAddress: string; profiles: string[] }>('ethProfile', publicKey)) ?? {
                ethAddress: publicKey,
                profiles: [],
            }
            ethProfile.profiles.push(profile)
            await storeDoc('ethProfile', publicKey, ethProfile)
        }
    }

    res.status(201).json(result)
}

export const updateProfile = async (ctx: RequestContext, req: Request, res: Response) => {
    const { profiles } = ctx
    const { profile } = req.body.data
    if (!profiles.includes(profile)) {
        res.status(401).send("You don't own this profile").end()
        return
    }

    res.status(500).send('WIP').end()
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
