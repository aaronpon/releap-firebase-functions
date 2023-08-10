import { IntentScope, toSingleSignaturePubkeyPair, verifyMessage } from '@mysten/sui.js'
import { getDynamicFieldByName, getProvider } from '../utils'

const MIN_VEREAP_CREATE_PROPOSAL = parseInt(process.env.MIN_VEREAP_CREATE_PROPOSAL ?? '500000')
const REAP_STAKING_POOL_ADDRESS = process.env.REAP_STAKING_POOL_ADDRESS

export async function verifySignature({
    data,
    chainId,
    wallet,
    signature,
}: {
    data: any
    chainId: string | number
    wallet: string
    signature: string
}): Promise<boolean> {
    if (chainId === 'sui') {
        const { pubKey } = toSingleSignaturePubkeyPair(signature)
        if (pubKey.toSuiAddress() !== wallet) {
            return false
        }
        return verifyMessage(data, signature, IntentScope.PersonalMessage)
    } else {
        throw new Error(`Not supported chainId ${chainId}`)
    }
}

export type VeReapLockInfo = {
    amount: string
    last_distribution_timestamp: string
    lock_time: string
    multiplier: string
    staking_start_timestamp: string
    vereap: string
    weeks: string
}

export async function getVeReapLock(wallet: string): Promise<VeReapLockInfo | null> {
    const pool = await getProvider().getObject({
        id: REAP_STAKING_POOL_ADDRESS as string,
        options: { showContent: true },
    })
    const bag = pool.data?.content?.dataType === 'moveObject' && pool.data?.content?.fields?.stakers?.fields?.id?.id

    try {
        const lockEntryResponse = await getDynamicFieldByName(bag, wallet, 'address')
        const lockEntry =
            lockEntryResponse.data?.content?.dataType === 'moveObject' &&
            lockEntryResponse.data?.content?.fields?.value?.fields

        return lockEntry
    } catch (err) {
        return null
    }
}

export async function getVeReapAmount(chainId: string | number, wallet: string): Promise<number> {
    if (chainId === 'sui') {
        const lock = await getVeReapLock(wallet)
        return lock != null ? parseInt(lock?.vereap) : 0
    } else {
        throw new Error(`Not supported chainId ${chainId}`)
    }
}

export async function checkVeReapThreshold(chainId: string | number, wallet: string): Promise<boolean> {
    return (await getVeReapAmount(chainId, wallet)) >= MIN_VEREAP_CREATE_PROPOSAL
}
