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

    try {
        const deployTokenTx = new TransactionBlock()

        deployTokenTx.setGasPayment([gas])

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

        const coinStructName = profile.name.replace(/\s/g, '_').toUpperCase()

        const treasuryCap = getCreatedObjectByType(result, /TreasuryCap/)

        const coinStruct = result.objectChanges?.find(
            (it) => it.type === 'created' && it.objectType.endsWith(coinStructName),
        )

        const coinType = coinStruct?.type === 'created' && coinStruct.objectType
        const [_package, _module, _] = (coinType as string).split('::')

        const deployPoolTx = new TransactionBlock()

        deployTokenTx.setGasPayment([gas])

        const mintedProfileToken = deployPoolTx.moveCall({
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

        const splitedReap = deployPoolTx.splitCoins(target, [deployPoolTx.pure(REAP_TOKEN_AMOUNT)])

        deployPoolTx.moveCall({
            target: `0x0::interface::create_v_pool`,
            typeArguments: [coinType as string, process.env.REAP_TYPE as string],
            arguments: [
                deployPoolTx.object(process.env.POOL_STORAGE as string),
                deployPoolTx.object(SUI_CLOCK_OBJECT_ID),
                mintedProfileToken,
                splitedReap,
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

        return profile
    } catch (err) {
        logger.error(err)
        throw err
        await returnGas(gas)
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
