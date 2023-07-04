import { JsonRpcProvider, PaginatedObjectsResponse } from '@mysten/sui.js'

export const RPC = process.env.SUI_RPC ?? 'https://fullnode.mainnet.sui.io:443'
export const TX_WINDOW = 500
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
