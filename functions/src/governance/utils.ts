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

export function getVeReapProjectedBalance(lock?: VeReapLockInfo | null | undefined): number {
    if (lock == null) {
        return 0
    }

    const now = Date.now()

    if (lock.lock_time === '0') {
        // User don't get any ve-balance for flexable staking
        return 0
    } else {
        const start = parseInt(lock.staking_start_timestamp)
        const lockTime = parseInt(lock.lock_time)
        const veReap = parseInt(lock.vereap)
        const lockedDuration = start + lockTime > now ? now - start : lockTime

        return (veReap * (lockTime - lockedDuration)) / lockTime
    }
}

export async function getVeReapAmount(chainId: string | number, wallet: string): Promise<number> {
    if (chainId === 'sui') {
        const lock = await getVeReapLock(wallet)
        return getVeReapProjectedBalance(lock)
    } else {
        throw new Error(`Not supported chainId ${chainId}`)
    }
}

export async function checkVeReapThreshold(chainId: string | number, wallet: string): Promise<boolean> {
    return (await getVeReapAmount(chainId, wallet)) >= MIN_VEREAP_CREATE_PROPOSAL
}
