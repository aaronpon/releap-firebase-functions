import { JsonRpcProvider, PaginatedObjectsResponse } from '@mysten/sui.js'

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
