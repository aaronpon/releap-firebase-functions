import { Connection, JsonRpcProvider, PaginatedCoins, PaginatedObjectsResponse, SUI_TYPE_ARG } from '@mysten/sui.js'
import { Response } from 'express'
import { Request } from 'firebase-functions/v2/https'
import { BadRequest, errorHandler } from './error'
import { ZodTypeAny, z } from 'zod'
import { RequestContext } from './types'
import { getRequestContext } from './auth'

export const RPC = process.env.SUI_RPC ?? 'https://mainnet-rpc.releap.xyz:443'
export const TX_WINDOW = 500

export const GAS_COUNT = parseInt(process.env.GAS_COUNT ?? '20')
export const GAS_AMOUNT = parseFloat(process.env.GAS_AMOUNT ?? '1')

type Something = NonNullable<object>

export const commonOnRequestSettings = {
    cors: [/localhost/, /.*\.releap\.xyz$/, /localhost:3000/, /.*\.d1doiqjkpgeoca\.amplifyapp\.com/],
    timeoutSeconds: 180,
}

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

export function getProvider() {
    return new JsonRpcProvider(new Connection({ fullnode: RPC }))
}

export async function getDynamicFieldByName(address: string, fieldName: string, fieldType = '0x1::string::String') {
    return await getProvider().getDynamicFieldObject({
        parentId: address,
        name: { value: fieldName, type: fieldType },
    })
}

export function errorCaptured(handler: (req: Request, res: Response) => Promise<void> | void) {
    return async (req: Request, res: Response) => {
        try {
            await handler(req, res)
        } catch (error) {
            errorHandler(error, res)
        }
    }
}

type Parsed<T extends ZodTypeAny | undefined> = T extends ZodTypeAny ? z.infer<T> : undefined
type CTX<T extends true | 'optional' | undefined> = T extends true
    ? RequestContext
    : T extends 'optional'
    ? RequestContext | undefined
    : undefined

async function parseOrThrow<T extends ZodTypeAny | undefined = undefined>(
    parser: T | undefined,
    data: any,
): Promise<Parsed<T>> {
    if (parser != null) {
        const parsed = await parser.safeParseAsync(data)
        if (!parsed.success) {
            throw new BadRequest(parsed.error.message)
        }
        return parsed.data
    } else {
        return undefined as Parsed<T>
    }
}

export function requestParser<
    B extends ZodTypeAny | undefined = undefined,
    Q extends ZodTypeAny | undefined = undefined,
    P extends ZodTypeAny | undefined = undefined,
    C extends true | 'optional' | undefined = undefined,
>(
    parser: { body?: B; query?: Q; params?: P; requireAuth?: C },
    handler: (payload: {
        req: Request
        body: Parsed<B>
        query: Parsed<Q>
        params: Parsed<P>
        ctx: CTX<C>
    }) => Promise<Something>,
) {
    return async (req: Request, res: Response) => {
        try {
            const [body, query, params] = await Promise.all([
                parseOrThrow(parser.body, req.body),
                parseOrThrow(parser.query, req.query),
                parseOrThrow(parser.params, req.params),
            ])

            let ctx
            if (parser.requireAuth != null) {
                try {
                    ctx = getRequestContext(req)
                } catch (err) {
                    if (parser.requireAuth !== 'optional') {
                        throw err
                    }
                }
            }

            const result = await handler({ req, body, query, params, ctx: ctx as CTX<C> })
            const statusCode = req.method === 'POST' ? 201 : 200

            res.status(statusCode).json(result)
        } catch (err) {
            errorHandler(err, res)
        }
    }
}

export function extractCtx<T>(req: Request, handler: (ctx: RequestContext, payload: T) => Promise<Something>) {
    return async (req: Request, payload: T) => {
        const ctx = getRequestContext(req)
        return await handler(ctx, payload)
    }
}
