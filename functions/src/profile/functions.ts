import { RawSigner, SUI_CLOCK_OBJECT_ID, TransactionBlock, fromB64, normalizeSuiObjectId } from '@mysten/sui.js'
import axios from 'axios'

import { IProfile } from '../types'
import { getCreatedObjectByType } from '../utils'
import { CompiledToken } from './types'

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

    const deployTokenTx = new TransactionBlock()

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
    const [_package, _module, _] = coinType as string

    const deployPoolTx = new TransactionBlock()

    const mintedProfileToken = deployPoolTx.moveCall({
        target: `${_package}::${_module}::mint_only`,
        arguments: [deployPoolTx.object(treasuryCap as string), deployPoolTx.pure(PROFILE_TOKEN_AMOUNT)],
        typeArguments: [],
    })

    const splitedReap = deployPoolTx.splitCoins(deployPoolTx.object(process.env.REAP_COIN as string), [
        deployPoolTx.pure(REAP_TOKEN_AMOUNT),
    ])

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
