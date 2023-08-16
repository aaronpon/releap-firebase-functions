import fetch from 'node-fetch'

import { Request } from 'firebase-functions/v2/https'
import { Response } from 'express'

// The Firebase Admin SDK to access the Firebase Realtime Database.
import admin from 'firebase-admin'

import {
    CreateComment,
    CreatePost,
    CreateProfile,
    FollowProfile,
    LikePost,
    RequestContext,
    TaskRequest,
    TaskResponse,
    UnfollowProfile,
    UnlikePost,
    UpdateProfileCover,
    UpdateProfileDescription,
    UpdateProfileImage,
} from './types'
import { RPC, findProfileOwnerCapFromChain, obj2Arr, sleep } from './utils'
import { checkAddressOwnsProfileName } from './ethereum'
import { JsonRpcProvider, Connection } from '@mysten/sui.js'
import { findProfileOwnerCap, setProfileOwnerCap } from './firestore'
import * as logger from 'firebase-functions/logger'
import { AuthError, ServerError } from './error'
import { z } from 'zod'

globalThis.fetch = fetch as any

export const createProfile = async (ctx: RequestContext, data: z.infer<typeof CreateProfile>['data']) => {
    const { isEth, publicKey } = ctx
    const { profileName } = data

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
        throw new AuthError('Profile Exists on Sui')
    }

    if (isEth && profileName) {
        if (!ownsProfile) {
            while (shouldWait) {
                await sleep(waitedCount * 2000)
                ownsProfile = await checkAddressOwnsProfileName(publicKey, profileName)
                if (waitedCount > 10) {
                    shouldWait = false
                    logger.error("You don't own this profile name on EVM Chain")
                    throw new AuthError("You don't own this profile name on EVM Chain")
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

    return result
}

export const updateProfile = async (ctx: RequestContext, req: Request, _res: Response) => {
    const { profiles } = ctx
    const { profile } = req.body.data
    if (!profiles.includes(profile)) {
        throw new AuthError("You don't own this profile")
    }

    throw new ServerError('WIP')
}

export const createPost = async (ctx: RequestContext, data: z.infer<typeof CreatePost>['data']) => {
    const { profiles } = ctx
    const { profile, imageUrl, content } = data
    if (!profiles.includes(profile)) {
        throw new AuthError("You don't own this profile")
    }

    const task: TaskRequest = {
        data: {
            action: 'createPost',
            payload: { profile, imageUrl: imageUrl ?? '', content: content ?? '' },
        },
    }
    const { key } = await admin.database().ref('/tasks').push(task)
    const result = await waitTask(key as string)
    return result
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

export const createComment = async (ctx: RequestContext, data: z.infer<typeof CreateComment>['data']) => {
    const { profiles } = ctx
    const { post, profile, content } = data

    if (!profiles.includes(profile)) {
        throw new AuthError("You don't own this profile")
    }

    const task: TaskRequest = {
        data: {
            action: 'createComment',
            payload: { profile, post, content },
        },
    }
    const { key } = await admin.database().ref('/tasks').push(task)
    const result = await waitTask(key as string)

    return result
}

export const likePost = async (ctx: RequestContext, data: z.infer<typeof LikePost>['data']) => {
    const { profiles } = ctx
    const { profile, post } = data

    if (!profiles.includes(profile)) {
        throw new AuthError("You don't own this profile")
    }

    const task: TaskRequest = {
        data: {
            action: 'likePost',
            payload: { profile, post },
        },
    }
    const { key } = await admin.database().ref('/tasks').push(task)
    const result = await waitTask(key as string)
    return result
}

export const unlikePost = async (ctx: RequestContext, data: z.infer<typeof UnlikePost>['data']) => {
    const { profiles } = ctx
    const { profile, post } = data

    if (!profiles.includes(profile)) {
        throw new AuthError("You don't own this profile")
    }

    const task: TaskRequest = {
        data: {
            action: 'unlikePost',
            payload: { profile, post },
        },
    }
    const { key } = await admin.database().ref('/tasks').push(task)
    const result = await waitTask(key as string)
    return result
}

export const followProfile = async (ctx: RequestContext, data: z.infer<typeof FollowProfile>['data']) => {
    const { profiles } = ctx
    const { followingProfile, profile } = data

    if (!profiles.includes(profile)) {
        throw new AuthError("You don't own this profile")
    }
    const task: TaskRequest = {
        data: {
            action: 'followProfile',
            payload: { profile, followingProfile },
        },
    }
    const { key } = await admin.database().ref('/tasks').push(task)
    const result = await waitTask(key as string)
    return result
}

export const unfollowProfile = async (ctx: RequestContext, data: z.infer<typeof UnfollowProfile>['data']) => {
    const { profiles } = ctx
    const { followingProfile, profile } = data

    if (!profiles.includes(profile)) {
        throw new AuthError("You don't own this profile")
    }

    const task: TaskRequest = {
        data: {
            action: 'unfollowProfile',
            payload: { profile, followingProfile },
        },
    }
    const { key } = await admin.database().ref('/tasks').push(task)
    const result = await waitTask(key as string)
    return result
}

export const updateProfileImage = async (ctx: RequestContext, data: z.infer<typeof UpdateProfileImage>['data']) => {
    const { profiles, provider, adminPublicKey } = ctx
    const { imageUrl, profile } = data

    if (!profiles.includes(profile)) {
        throw new AuthError("You don't own this profile")
    }

    const profileOwnerCap = await findAndSetProfileOwnerCap(provider, adminPublicKey, profile)

    if (profileOwnerCap == null) {
        throw new ServerError('Fail to find profileOwnerCap')
    }

    const task: TaskRequest = {
        data: {
            action: 'updateProfileImage',
            payload: { profile, imageUrl, profileOwnerCap },
        },
    }
    const { key } = await admin.database().ref('/tasks').push(task)
    const result = await waitTask(key as string)
    return result
}

export const updateProfileCover = async (ctx: RequestContext, data: z.infer<typeof UpdateProfileCover>['data']) => {
    const { profiles, provider, adminPublicKey } = ctx
    const { coverUrl, profile } = data

    if (!profiles.includes(profile)) {
        throw new AuthError("You don't own this profile")
    }
    const profileOwnerCap = await findAndSetProfileOwnerCap(provider, adminPublicKey, profile)

    if (profileOwnerCap == null) {
        throw new ServerError('Fail to find profileOwnerCap')
    }

    const task: TaskRequest = {
        data: {
            action: 'updateProfileCover',
            payload: { profile, coverUrl, profileOwnerCap },
        },
    }
    const { key } = await admin.database().ref('/tasks').push(task)
    const result = await waitTask(key as string)
    return result
}

export const updateProfileDescription = async (
    ctx: RequestContext,
    data: z.infer<typeof UpdateProfileDescription>['data'],
) => {
    const { profiles, provider, adminPublicKey } = ctx
    const { description, profile } = data

    if (!profiles.includes(profile)) {
        throw new AuthError("You don't own this profile")
    }

    const profileOwnerCap = await findAndSetProfileOwnerCap(provider, adminPublicKey, profile)

    if (profileOwnerCap == null) {
        throw new ServerError('Fail to find profileOwnerCap')
    }

    const task: TaskRequest = {
        data: {
            action: 'updateProfileDescription',
            payload: { profile, description, profileOwnerCap },
        },
    }
    const { key } = await admin.database().ref('/tasks').push(task)
    const result = await waitTask(key as string)
    return result
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
