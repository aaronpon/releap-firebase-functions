import { JsonRpcProvider, PaginatedCoins, PaginatedObjectsResponse, SUI_TYPE_ARG } from '@mysten/sui.js'

export const RPC = process.env.SUI_RPC ?? 'https://mainnet-rpc.releap.xyz:443'
export const TX_WINDOW = 500

export const GAS_COUNT = parseInt(process.env.GAS_COUNT ?? '20')
export const GAS_AMOUNT = parseFloat(process.env.GAS_AMOUNT ?? '1')

export async function getAllOwnedObjects(provider: JsonRpcProvider, address: string) {
    const data: PaginatedObjectsResponse['data'] = []
    let nextCursor = null
    let hasNextPage = true

    while (hasNextPage) {
        const ownedObjectsResponse: PaginatedObjectsResponse = await provider.getOwnedObjects({
            owner: address,
            options: { showType: true, showContent: true },
            cursor: nextCursor,
        })

        hasNextPage = ownedObjectsResponse.hasNextPage
        nextCursor = ownedObjectsResponse.nextCursor

        data.push(...ownedObjectsResponse.data)
    }
    return data
}

export async function getAllOwnedCoinss(provider: JsonRpcProvider, address: string) {
    const data: PaginatedCoins['data'] = []
    let nextCursor = null
    let hasNextPage = true

    while (hasNextPage) {
        const ownedObjectsResponse: PaginatedCoins = await provider.getCoins({
            owner: address,
            coinType: SUI_TYPE_ARG,
            cursor: nextCursor,
        })

        hasNextPage = ownedObjectsResponse.hasNextPage
        nextCursor = ownedObjectsResponse.nextCursor

        data.push(...ownedObjectsResponse.data)
    }
    return data.map((it) => ({
        objectId: it.coinObjectId,
        version: it.version,
        digest: it.digest,
    }))
}

export async function findProfileOwnerCapFromChain(provider: JsonRpcProvider, wallet: string, profile: string) {
    const dappPackages = process.env.DAPP_PACKAGES?.split(',') ?? []
    const objects = await getAllOwnedObjects(provider, wallet)

    return objects.find((obj) => {
        const content = obj.data?.content
        if (content?.dataType === 'moveObject') {
            const objPackage = content?.type.split('::')[0]
            return content.fields['profile'] === profile && dappPackages.includes(objPackage)
        }
        return false
    })?.data?.objectId
}

export async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

export function obj2Arr(object: any): any {
    if (Array.isArray(object)) {
        return object
    }

    if (typeof object !== 'object') {
        return object
    }
    if (object[0]) {
        return Object.keys(object).reduce<any[]>((acc, curr) => {
            acc.push(object[curr])
            return acc
        }, [])
    } else {
        const converted: any = {}
        for (const key in object) {
            converted[key] = obj2Arr(object[key])
        }
        return converted
    }
}

export async function retry<T>(
    callback: () => Promise<T>,
    options: {
        retryCount: number
        retryDelayMs: number
    },
): Promise<T> {
    let retry = 0
    while (retry <= options.retryCount) {
        try {
            return await callback()
        } catch (err) {
            if (retry >= options.retryCount) {
                throw err
            }
            retry++
        }
        await sleep(options.retryDelayMs)
    }
    throw new Error('Retry limit exceeded')
}
