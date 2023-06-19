import {
    Connection,
    Ed25519Keypair,
    JsonRpcProvider,
    RawSigner,
    SuiTransactionBlockResponse,
    SUI_CLOCK_OBJECT_ID,
    TransactionBlock,
} from '@mysten/sui.js'
import { onValueCreated, onValueWritten } from 'firebase-functions/v2/database'
import * as logger from 'firebase-functions/logger'
import { Flags, ShareContext, TaskRequest } from './types'
import { obj2Arr, RPC, sleep, TX_WINDOW } from './utils'

import admin from 'firebase-admin'

export const taskCreated = onValueCreated('/tasks/{taskId}', async (event) => {
    await admin.database().ref('/flags/shared/lastRequest').set(event.params.taskId)
})

export const flagsUpdated = onValueWritten(
    {
        ref: '/flags/shared',
        secrets: ['SEED_PHRASE'],
    },
    async (event) => {
        let after = obj2Arr(event.data.after.toJSON()) as unknown as Flags

        if (after.locked === true || after.lastProcessedRequests?.includes(after.lastRequest ?? '')) {
            return
        }
        await admin.database().ref('/flags/shared/locked').set(true)

        let shouldWait = true
        let waitedCount = 0

        while (shouldWait) {
            await sleep(TX_WINDOW)
            const last = (await admin.database().ref('/flags/shared').get()).toJSON() as unknown as Flags
            if (waitedCount > 5 || last.lastRequest === after.lastRequest) {
                shouldWait = false
            } else {
                after = last
            }
            waitedCount++
        }
        const tasks = (await admin.database().ref('/tasks').get()).toJSON() as Record<string, TaskRequest>
        if (tasks == null || Object.keys(tasks).length === 0) {
            await admin.database().ref('/flags/shared/locked').set(false)
            return
        }

        const keypair = Ed25519Keypair.deriveKeypair(process.env.SEED_PHRASE as string)
        const provider = new JsonRpcProvider(new Connection({ fullnode: RPC }))

        const shareCtx: ShareContext = {
            provider,
            signer: new RawSigner(keypair, provider),
            dappPackages: process.env.DAPP_PACKAGES?.split(',') ?? [],
            recentPosts: process.env.RECENT_POSTS as string,
            adminCap: process.env.ADMIN_CAP as string,
            profileIndex: process.env.PROFILE_INDEX as string,
        }

        try {
            const { digest, effects, events } = await tasksRunner(shareCtx, Object.values(tasks))
            for (const key in tasks) {
                await admin.database().ref(`/tasks_res/${key}`).set({ digest, effects, events })
            }
        } catch (err) {
            logger.error(err)
        } finally {
            for (const key in tasks) {
                await admin.database().ref(`/tasks/${key}`).remove()
            }
            await admin.database().ref('/flags/shared/lastProcessedRequests').set(Object.keys(tasks))
            await admin.database().ref('/flags/shared/locked').set(false)
        }
    },
)

async function tasksRunner(ctx: ShareContext, tasks: TaskRequest[]): Promise<SuiTransactionBlockResponse> {
    const { signer, dappPackages, adminCap, recentPosts, profileIndex } = ctx
    const tx = tasks.reduce((tx, curr) => {
        switch (curr.data.action) {
            case 'createProfile':
                tx.moveCall({
                    target: `${dappPackages[0]}::releap_social::new_profile_with_admin_cap`,
                    arguments: [
                        tx.object(profileIndex),
                        tx.pure(curr.data.payload.profileName),
                        tx.object(SUI_CLOCK_OBJECT_ID),
                        tx.object(adminCap),
                    ],
                })
                break
            case 'createPost':
                tx.moveCall({
                    target: `${dappPackages[0]}::releap_social::create_post_with_admin_cap`,
                    arguments: [
                        tx.object(curr.data.payload.profile),
                        tx.object(adminCap),
                        tx.object(recentPosts),
                        tx.pure(curr.data.payload.imageUrl),
                        tx.pure(curr.data.payload.content),
                        tx.object(SUI_CLOCK_OBJECT_ID),
                    ],
                })
                break
            case 'createComment':
                tx.moveCall({
                    target: `${dappPackages[0]}::releap_social::create_comment_with_admin_cap`,
                    arguments: [
                        tx.object(curr.data.payload.post),
                        tx.object(curr.data.payload.profile),
                        tx.object(adminCap),
                        tx.object(recentPosts),
                        tx.pure(curr.data.payload.content),
                        tx.object(SUI_CLOCK_OBJECT_ID),
                    ],
                })
                break
            case 'likePost':
                tx.moveCall({
                    target: `${dappPackages[0]}::releap_social::like_post_with_admin_cap`,
                    typeArguments: [],
                    arguments: [
                        tx.object(curr.data.payload.post),
                        tx.object(curr.data.payload.profile),
                        tx.object(adminCap),
                    ],
                })
                break
            case 'unlikePost':
                tx.moveCall({
                    target: `${dappPackages[0]}::releap_social::unlike_post_with_admin_cap`,
                    typeArguments: [],
                    arguments: [
                        tx.object(curr.data.payload.post),
                        tx.object(curr.data.payload.profile),
                        tx.object(adminCap),
                    ],
                })
                break
            case 'followProfile':
                tx.moveCall({
                    target: `${dappPackages[0]}::releap_social::follow_with_admin_cap`,
                    typeArguments: [],
                    arguments: [
                        tx.object(curr.data.payload.followingProfile),
                        tx.object(curr.data.payload.profile),
                        tx.object(adminCap),
                    ],
                })
                break
            case 'unfollowProfile':
                tx.moveCall({
                    target: `${dappPackages[0]}::releap_social::unfollow_with_admin_cap`,
                    typeArguments: [],
                    arguments: [
                        tx.object(curr.data.payload.followingProfile),
                        tx.object(curr.data.payload.profile),
                        tx.object(adminCap),
                    ],
                })
                break
        }
        return tx
    }, new TransactionBlock())

    return await signer.signAndExecuteTransactionBlock({
        transactionBlock: tx,
        options: { showEvents: true, showEffects: true },
    })
}
