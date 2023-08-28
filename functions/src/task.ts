import {
    Connection,
    Ed25519Keypair,
    JsonRpcProvider,
    RawSigner,
    SuiTransactionBlockResponse,
    SUI_CLOCK_OBJECT_ID,
    TransactionBlock,
    SuiObjectRef,
    MIST_PER_SUI,
} from '@mysten/sui.js'
import { onValueCreated } from 'firebase-functions/v2/database'
import * as logger from 'firebase-functions/logger'
import { ShareContext, TaskRequest } from './types'
import { GAS_AMOUNT, GAS_COUNT, RPC, getAllOwnedCoinss, retry } from './utils'

import admin from 'firebase-admin'
import { db } from './firestore'

export const taskCreated = onValueCreated(
    {
        ref: '/tasks/{taskId}',
        secrets: ['SEED_PHRASE'],
    },
    async (event) => {
        const taskId = event.params.taskId
        const task = event.data.toJSON() as unknown as TaskRequest

        const keypair = Ed25519Keypair.deriveKeypair(process.env.SEED_PHRASE as string)
        const provider = new JsonRpcProvider(new Connection({ fullnode: RPC }))

        const shareCtx: ShareContext = {
            provider,
            signer: new RawSigner(keypair, provider),
            dappPackages: process.env.DAPP_PACKAGES?.split(',') ?? [],
            recentPosts: process.env.RECENT_POSTS as string,
            adminCap: process.env.ADMIN_CAP as string,
            adminPublicKey: process.env.ADMIN_PUBLICKEY as string,
            index: process.env.INDEX as string,
            profileTable: process.env.PROFILE_TABLE as string,
            isAdmin: false,
        }

        try {
            const { digest, effects, events } = await retry(async () => await tasksRunner(shareCtx, [task]), {
                // createProfile may fail due to the profileIndex is locked by other tx
                retryCount: task.data.action === 'createProfile' ? 50 : 5,
                retryDelayMs: 0,
            })
            await admin.database().ref(`/tasks_res/${taskId}`).set({ digest, effects, events })
        } catch (error) {
            if (error instanceof Error) {
                await admin.database().ref(`/tasks_res/${taskId}`).set({ error: error.message })
            }
            logger.error(error)
        } finally {
            await admin.database().ref(`/tasks/${taskId}`).remove()
        }
    },
)

export async function getGasCount(): Promise<number> {
    const result = await db.collection('gas').count().get()
    return result.data().count
}

export async function borrowGas(): Promise<SuiObjectRef | null> {
    const ref = db.collection('gas').orderBy('lastUsed').limit(1)
    return await db.runTransaction(
        async (tx) => {
            const docs = (await tx.get(ref)).docs
            if (docs.length > 0) {
                const coin = docs[0].data() as SuiObjectRef
                const refToDelete = db.collection('gas').doc(coin.objectId)
                tx.delete(refToDelete)
                return coin
            } else {
                return null
            }
        },
        { maxAttempts: 100 },
    )
}

export async function returnGas(coin: SuiObjectRef) {
    await db.runTransaction(async (tx) => {
        const ref = db.collection('gas').doc(coin.objectId)
        tx.set(ref, { ...coin, lastUsed: Date.now() })
    })
}

export async function rebalanceGas(ignoreGasCheck = false) {
    if (!ignoreGasCheck) {
        const count = await getGasCount()

        if (count > GAS_COUNT / 3) {
            return
        }
    }
    const keypair = Ed25519Keypair.deriveKeypair(process.env.SEED_PHRASE as string)
    const provider = new JsonRpcProvider(new Connection({ fullnode: RPC }))
    const signer = new RawSigner(keypair, provider)
    const publicKey = keypair.getPublicKey().toSuiAddress()

    const tx = new TransactionBlock()
    const ownedGas = await getAllOwnedCoinss(provider, keypair.getPublicKey().toSuiAddress())
    tx.setGasPayment(ownedGas)
    const amounts = Array(GAS_COUNT).fill(tx.pure(GAS_AMOUNT * Number(MIST_PER_SUI)))
    const splitCoins = tx.splitCoins(tx.gas, amounts)
    const array = amounts.map((_, idx) => splitCoins[idx])

    tx.transferObjects(array, tx.pure(publicKey))

    const result = await signer.signAndExecuteTransactionBlock({
        transactionBlock: tx,
        options: { showObjectChanges: true },
    })

    const coins: SuiObjectRef[] = (result.objectChanges ?? []).filter((it) => it.type === 'created') as SuiObjectRef[]

    await db.runTransaction(async (tx) => {
        const delDocRefs = db.collection('gas')
        const delDocs = await tx.get(delDocRefs)
        // remove the old gas, as the objectId will change after rebalance
        for (const delDoc of delDocs.docs) {
            tx.delete(delDoc.ref)
        }
        coins.forEach((coin) => {
            const ref = db.collection('gas').doc(coin.objectId)
            tx.set(ref, { ...coin, lastUsed: Date.now() })
        })
    })
}

export async function tasksRunner(ctx: ShareContext, tasks: TaskRequest[]): Promise<SuiTransactionBlockResponse> {
    const { signer, dappPackages, adminCap, index } = ctx
    const txBlock = new TransactionBlock()

    const gas = await retry(
        async () => {
            const gas = await borrowGas()
            if (gas == null) {
                throw new Error('Server busy, no gas coin avaliable')
            }
            return gas
        },
        {
            retryCount: 50,
            retryDelayMs: 500,
        },
    )

    txBlock.setGasPayment([gas])

    const tx = tasks.reduce((tx, curr) => {
        switch (curr.data.action) {
            case 'createProfile':
                tx.moveCall({
                    target: `${dappPackages[0]}::releap_social::new_profile_with_admin_cap`,
                    arguments: [
                        tx.object(index),
                        tx.pure(curr.data.payload.profileName),
                        tx.object(SUI_CLOCK_OBJECT_ID),
                        tx.object(adminCap),
                    ],
                })
                break
            case 'createPost':
                tx.moveCall({
                    target: `${dappPackages[0]}::releap_social::create_post_delegated`,
                    arguments: [
                        tx.object(curr.data.payload.profile),
                        tx.pure(curr.data.payload.imageUrl),
                        tx.pure(curr.data.payload.content),
                        tx.object(SUI_CLOCK_OBJECT_ID),
                    ],
                })
                break
            case 'createComment':
                tx.moveCall({
                    target: `${dappPackages[0]}::releap_social::create_comment_delegated`,
                    arguments: [
                        tx.object(curr.data.payload.post),
                        tx.object(curr.data.payload.profile),
                        tx.pure(curr.data.payload.content),
                        tx.object(SUI_CLOCK_OBJECT_ID),
                    ],
                })
                break
            case 'likePost':
                tx.moveCall({
                    target: `${dappPackages[0]}::releap_social::like_post_delegated`,
                    typeArguments: [],
                    arguments: [tx.object(curr.data.payload.post), tx.object(curr.data.payload.profile)],
                })
                break
            case 'unlikePost':
                tx.moveCall({
                    target: `${dappPackages[0]}::releap_social::unlike_post_delegated`,
                    typeArguments: [],
                    arguments: [tx.object(curr.data.payload.post), tx.object(curr.data.payload.profile)],
                })
                break
            case 'followProfile':
                tx.moveCall({
                    target: `${dappPackages[0]}::releap_social::follow_delegated`,
                    typeArguments: [],
                    arguments: [tx.object(curr.data.payload.followingProfile), tx.object(curr.data.payload.profile)],
                })
                break
            case 'unfollowProfile':
                tx.moveCall({
                    target: `${dappPackages[0]}::releap_social::unfollow_delegated`,
                    typeArguments: [],
                    arguments: [tx.object(curr.data.payload.followingProfile), tx.object(curr.data.payload.profile)],
                })
                break
            case 'updateProfileImage':
                tx.moveCall({
                    target: `${dappPackages[0]}::releap_social::update_profile_image`,
                    typeArguments: [],
                    arguments: [
                        tx.object(curr.data.payload.profile),
                        tx.object(curr.data.payload.profileOwnerCap),
                        tx.object(curr.data.payload.imageUrl),
                    ],
                })
                break
            case 'updateProfileCover':
                tx.moveCall({
                    target: `${dappPackages[0]}::releap_social::update_profile_cover_image`,
                    typeArguments: [],
                    arguments: [
                        tx.object(curr.data.payload.profile),
                        tx.object(curr.data.payload.profileOwnerCap),
                        tx.object(curr.data.payload.coverUrl),
                    ],
                })
                break
            case 'updateProfileDescription':
                tx.moveCall({
                    target: `${dappPackages[0]}::releap_social::update_profile_description`,
                    typeArguments: [],
                    arguments: [
                        tx.object(curr.data.payload.profile),
                        tx.object(curr.data.payload.profileOwnerCap),
                        tx.object(curr.data.payload.description),
                    ],
                })
                break
        }
        return tx
    }, txBlock)

    try {
        const result = await signer.signAndExecuteTransactionBlock({
            transactionBlock: tx,
            options: { showEvents: true, showEffects: true },
        })

        const usedGas = result.effects?.gasObject.reference

        if (usedGas) {
            await returnGas(usedGas)
        }
        return result
    } catch (err) {
        console.log(err)
        // return original gas
        await returnGas(gas)
        throw err
    }
}
