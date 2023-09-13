import {
    JsonRpcProvider,
    RawSigner,
    SUI_CLOCK_OBJECT_ID,
    TransactionBlock,
    fromB64,
    normalizeSuiObjectId,
} from '@mysten/sui.js'
import axios from 'axios'
import * as logger from 'firebase-functions/logger'

import { IProfile } from '../types'
import { getCreatedObjectByType, retry } from '../utils'
import { CompiledToken } from './types'
import { borrowGas, returnGas } from '../task'

const PROFILE_TOKEN_AMOUNT = 300
const REAP_TOKEN_AMOUNT = 30000 * 1_000_000_000

export async function createProfileToken(profile: IProfile, options: { signer: RawSigner }) {
    const { signer } = options
    const signerAddress = await signer.getAddress()

    const { modules, dependencies } = await getCompiledToken({
        name: profile.name,
        symbol: profile.name,
        description: `Releap Profile Token: ${profile.name}`,
    })

    const gas1 = await retry(
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

    const gas2 = await retry(
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

    try {
        const deployTokenTx = new TransactionBlock()

        deployTokenTx.setGasPayment([gas1])

        const [upgradeCap] = deployTokenTx.publish({
            modules: modules.map((it) => Array.from(fromB64(it))),
            dependencies: dependencies.map((it) => normalizeSuiObjectId(it)),
        })

        deployTokenTx.transferObjects([upgradeCap], deployTokenTx.pure(signerAddress))

        const result = await signer.signAndExecuteTransactionBlock({
            transactionBlock: deployTokenTx,
            options: {
                showEvents: true,
                showEffects: true,
                showObjectChanges: true,
            },
        })

        const coinStruct = result.objectChanges?.find((it) => it.type === 'published')

        const treasuryCap = getCreatedObjectByType(result, /TreasuryCap/)
        const coinStructName = profile.name.replace(/\s/g, '_').toUpperCase()

        const _package = coinStruct?.type === 'published' && coinStruct.packageId
        const [_module] = (coinStruct?.type === 'published' && coinStruct.modules) as string[]

        const coinType = `${_package}::${_module}::${coinStructName}`

        const deployPoolTx = new TransactionBlock()

        deployPoolTx.setGasPayment([gas2])

        const [mintedProfileToken] = deployPoolTx.moveCall({
            target: `${_package}::${_module}::mint_only`,
            arguments: [deployPoolTx.object(treasuryCap as string), deployPoolTx.pure(PROFILE_TOKEN_AMOUNT)],
            typeArguments: [],
        })

        const reapToken = await getAllCoinsByType({
            provider: signer.provider,
            owner: signerAddress,
            coinType: process.env.REAP_TYPE as string,
        })

        const [target, ...rest] = reapToken.map((it) => deployPoolTx.object(it.coinObjectId))

        if (reapToken.length > 1) {
            deployPoolTx.mergeCoins(target, rest)
        }

        const [splitedReap] = deployPoolTx.splitCoins(target, [deployPoolTx.pure(REAP_TOKEN_AMOUNT)])

        deployPoolTx.moveCall({
            target: `${process.env.AMM_ADDRESS}::interface::create_v_pool`,
            typeArguments: [coinType, process.env.REAP_TYPE as string],
            arguments: [
                deployPoolTx.object(process.env.POOL_STORAGE as string),
                deployPoolTx.object(SUI_CLOCK_OBJECT_ID),
                deployPoolTx.makeMoveVec({ objects: [mintedProfileToken] }),
                deployPoolTx.makeMoveVec({ objects: [splitedReap] }),
                deployPoolTx.pure(PROFILE_TOKEN_AMOUNT),
                deployPoolTx.pure(REAP_TOKEN_AMOUNT),
            ],
        })

        await signer.signAndExecuteTransactionBlock({
            transactionBlock: deployPoolTx,
            options: {
                showObjectChanges: true,
                showEffects: true,
                showEvents: true,
            },
        })

        profile.profileTokenType = coinType as string
        profile.profileTokenTreasuryCap = treasuryCap as string

        return profile
    } catch (err) {
        logger.error(err)
        throw err
    } finally {
        await returnGas(gas1)
        await returnGas(gas2)
    }
}

async function getCompiledToken(options: {
    name: string
    description: string
    symbol: string
}): Promise<CompiledToken> {
    const res = await axios.post(`${process.env.TOKEN_BUILDER_ENDPOINT}/build`, options)
    return {
        ...res.data,
    }
}

export const getAllCoinsByType = async (options: {
    provider: JsonRpcProvider
    owner: string
    coinType: string
}): Promise<
    {
        version: string
        digest: string
        coinType: string
        previousTransaction: string
        coinObjectId: string
        balance: string
        lockedUntilEpoch?: number | null | undefined
    }[]
> => {
    let cursor = null
    let hasNextPage = true
    const result = []

    while (hasNextPage) {
        const response = await options.provider.getCoins({ owner: options.owner, coinType: options.coinType, cursor })
        cursor = response.nextCursor
        hasNextPage = response.hasNextPage
        result.push(...response.data)
    }

    return result
}
