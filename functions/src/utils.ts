import {
    Connection,
    DynamicFieldPage,
    Ed25519Keypair,
    JsonRpcProvider,
    PaginatedCoins,
    PaginatedObjectsResponse,
    RawSigner,
    SUI_TYPE_ARG,
    SuiTransactionBlockResponse,
} from '@mysten/sui.js'
import { Response, Request } from 'express'
import { ParseInputError, errorHandler } from './error'
import { ZodTypeAny, z } from 'zod'
import { RequestContext } from './types'
import { getRequestContext } from './auth'
import { ServerError } from './error'

export const RPC = process.env.SUI_RPC ?? 'https://mainnet-rpc.releap.xyz:443'
export const TX_WINDOW = 500

export const GAS_COUNT = parseInt(process.env.GAS_COUNT ?? '20')
export const GAS_AMOUNT = parseFloat(process.env.GAS_AMOUNT ?? '1')

type Something = NonNullable<object>

export const commonOnRequestSettings = {
    cors: [/localhost/, /.*\.releap\.xyz$/, /localhost:3000/, /.*\.d1doiqjkpgeoca\.amplifyapp\.com/],
    secrets: ['JWT_SECRET'],
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

type AdminSigner<S extends true | undefined> = S extends true ? RawSigner : undefined

async function parseOrThrow<T extends ZodTypeAny | undefined = undefined>(
    parser: T | undefined,
    data: any,
): Promise<Parsed<T>> {
    if (parser != null) {
        const parsed = await parser.safeParseAsync(data)
        if (!parsed.success) {
            throw new ParseInputError(parsed.error)
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
    S extends true | undefined = undefined,
>(
    parser: { body?: B; query?: Q; params?: P; requireAuth?: C; signer?: S },
    handler: (payload: {
        req: Request
        body: Parsed<B>
        query: Parsed<Q>
        params: Parsed<P>
        ctx: CTX<C>
        signer: AdminSigner<S>
    }) => Promise<Something>,
) {
    return async (req: Request, res: Response): Promise<void> => {
        try {
            const [body, query, params] = await Promise.all([
                parseOrThrow(parser.body, req.body),
                parseOrThrow(parser.query, req.query),
                parseOrThrow(parser.params, req.params),
            ])

            let ctx
            let signer
            if (parser.requireAuth != null) {
                try {
                    ctx = getRequestContext(req)
                } catch (err) {
                    if (parser.requireAuth !== 'optional') {
                        throw err
                    }
                }
            }
            if (parser.signer == true) {
                if (ctx == null) {
                    throw new ServerError('Cannot create signer without ctx')
                }
                const keypair = Ed25519Keypair.deriveKeypair(process.env.SEED_PHRASE as string)
                signer = new RawSigner(keypair, ctx.provider)
            }

            const result = await handler({
                req,
                body,
                query,
                params,
                ctx: ctx as CTX<C>,
                signer: signer as AdminSigner<S>,
            })
            const statusCode = req.method === 'POST' ? 201 : 200

            res.status(statusCode).json(result)
        } catch (err) {
            errorHandler(err, res)
        }
    }
}

export function getCreatedObjectByType(result: SuiTransactionBlockResponse, objectType: RegExp): string | undefined {
    const object = result.objectChanges?.find((it) => it.type === 'created' && it.objectType.match(objectType))
    // stupid typescript !
    if (object?.type === 'created') {
        return object.objectId
    } else {
        return undefined
    }
}

export async function getAllDynamicFields(provider: JsonRpcProvider, address: string) {
    const data: DynamicFieldPage['data'] = []
    let nextCursor = null
    let hasNextPage = true

    while (hasNextPage) {
        const dynamicFieldResponse: DynamicFieldPage = await provider.getDynamicFields({
            parentId: address,
            cursor: nextCursor,
        })
        hasNextPage = dynamicFieldResponse.hasNextPage
        nextCursor = dynamicFieldResponse.nextCursor
        data.push(...dynamicFieldResponse.data)
    }
    return data
}

// will return invalid profile names only
export async function validateProfileNames(provider: JsonRpcProvider, names: string[]): Promise<string[]> {
    const data = await getAllDynamicFields(provider, process.env.PROFILE_INDEX_TABLE as string)
    const set = new Set(data.map((it) => it.name.value))
    return names.filter((name) => !set.has(name))
}
