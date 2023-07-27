import fetch from 'node-fetch'

import { Request } from 'firebase-functions/v2/https'
import { Response } from 'express'

// The Firebase Admin SDK to access the Firebase Realtime Database.
import admin from 'firebase-admin'

import { RequestContext, TaskRequest, TaskResponse } from './types'
import { RPC, findProfileOwnerCapFromChain, obj2Arr, sleep } from './utils'
import { checkAddressOwnsProfileName } from './ethereum'
import { JsonRpcProvider, Connection } from '@mysten/sui.js'
import { findProfileOwnerCap, setProfileOwnerCap } from './firestore'
import * as logger from 'firebase-functions/logger'

globalThis.fetch = fetch as any

export const createProfile = async (ctx: RequestContext, req: Request, res: Response) => {
    const { isEth, publicKey } = ctx
    const { profileName } = req.body.data

    const task: TaskRequest = {
        data: {
            action: 'createProfile',
            payload: { profileName },
        },
    }
    let shouldWait = true
    let waitedCount = 0
    let ownsProfile = false

    const provider = new JsonRpcProvider(new Connection({ fullnode: RPC }))
    const df = await provider.getDynamicFieldObject({
        parentId: process.env.PROFILE_TABLE as string,
        name: { type: '0x1::string::String', value: profileName },
    })
    const profile = (df.data?.content?.dataType === 'moveObject' && df.data.content.fields.value) ?? ''

    if (profile) {
        res.status(401).send('Profile Exists on Sui').end()
    }

    if (isEth && profileName) {
        if (!ownsProfile) {
            while (shouldWait) {
                await sleep(waitedCount * 2000)
                ownsProfile = await checkAddressOwnsProfileName(publicKey, profileName)
                if (waitedCount > 5) {
                    shouldWait = false
                    logger.error("You don't own this profile name on EVM Chain")
                    res.status(401).send("You don't own this profile name on EVM Chain").end()
                } else if (ownsProfile) {
                    shouldWait = false
                }
                waitedCount++
            }
        }
    }

    logger.info('Found profile, creating sui profile')

    const { key } = await admin.database().ref('/tasks').push(task)
    const result = await waitTask(key as string)

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

export const updateProfileImage = async (ctx: RequestContext, req: Request, res: Response) => {
    const { profiles, provider, adminPublicKey } = ctx
    const { imageUrl, profile } = req.body.data

    if (!profiles.includes(profile)) {
        res.status(401).send("You don't own this profile").end()
        return
    }

    const profileOwnerCap = await findAndSetProfileOwnerCap(provider, adminPublicKey, profile)

    if (profileOwnerCap == null) {
        res.status(500).send('Fail to find profileOwnerCap').end()
        return
    }

    const task: TaskRequest = {
        data: {
            action: 'updateProfileImage',
            payload: { profile, imageUrl, profileOwnerCap },
        },
    }
    const { key } = await admin.database().ref('/tasks').push(task)
    const result = await waitTask(key as string)
    res.status(201).json(result)
}

export const updateProfileCover = async (ctx: RequestContext, req: Request, res: Response) => {
    const { profiles, provider, adminPublicKey } = ctx
    const { coverUrl, profile } = req.body.data

    if (!profiles.includes(profile)) {
        res.status(401).send("You don't own this profile").end()
        return
    }
    const profileOwnerCap = await findAndSetProfileOwnerCap(provider, adminPublicKey, profile)

    if (profileOwnerCap == null) {
        res.status(500).send('Fail to find profileOwnerCap').end()
        return
    }

    const task: TaskRequest = {
        data: {
            action: 'updateProfileCover',
            payload: { profile, coverUrl, profileOwnerCap },
        },
    }
    const { key } = await admin.database().ref('/tasks').push(task)
    const result = await waitTask(key as string)
    res.status(201).json(result)
}

export const updateProfileDescription = async (ctx: RequestContext, req: Request, res: Response) => {
    const { profiles, provider, adminPublicKey } = ctx
    const { description, profile } = req.body.data

    if (!profiles.includes(profile)) {
        res.status(401).send("You don't own this profile").end()
        return
    }

    const profileOwnerCap = await findAndSetProfileOwnerCap(provider, adminPublicKey, profile)

    if (profileOwnerCap == null) {
        res.status(500).send('Fail to find profileOwnerCap').end()
        return
    }

    const task: TaskRequest = {
        data: {
            action: 'updateProfileDescription',
            payload: { profile, description, profileOwnerCap },
        },
    }
    const { key } = await admin.database().ref('/tasks').push(task)
    const result = await waitTask(key as string)
    res.status(201).json(result)
}

export async function waitTask(taskId: string) {
    while (true) {
        const taskRes = await admin.database().ref(`/tasks_res/${taskId}`).once('value')
        const json = taskRes.toJSON() as unknown as TaskResponse | undefined
        if (json != null) {
            await admin.database().ref(`/tasks_res/${taskId}`).remove()
            return obj2Arr(json)
        }
    }
}

async function findAndSetProfileOwnerCap(provider: JsonRpcProvider, adminPublicKey: string, profile: string) {
    let profileOwnerCap: string | undefined = await findProfileOwnerCap(profile)
    if (profileOwnerCap == null) {
        profileOwnerCap = await findProfileOwnerCapFromChain(provider, adminPublicKey, profile)
        if (profileOwnerCap != null) {
            await setProfileOwnerCap(profile, profileOwnerCap)
        }
    }
    return profileOwnerCap
}
