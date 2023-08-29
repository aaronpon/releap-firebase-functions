import { onRequest } from 'firebase-functions/v2/https'
import { CreateCurationListInput, RemoveCurationListInput, UpdateCurationListInput } from './types'
import { createCurationList, removeCurationList, updateCurationList } from './functions'
import { commonOnRequestSettings, requestParser } from '../utils'
import express from 'express'
import { z } from 'zod'
import { getDoc, getDocs } from '../firestore'
import { AuthError, NotFoundError } from '../error'
import { IPost, IProfile } from '../types'

const app = express()

app.post('/', requestParser({ body: CreateCurationListInput, requireAuth: true }, createCurationList))
app.put(
    '/:curationListId',
    requestParser(
        { body: UpdateCurationListInput, params: z.object({ curationListId: z.string() }), requireAuth: true },
        updateCurationList,
    ),
)
app.delete(
    '/:curationListId',
    requestParser(
        { body: RemoveCurationListInput, params: z.object({ curationListId: z.string() }), requireAuth: true },
        removeCurationList,
    ),
)

app.get(
    '/',
    requestParser(
        { query: z.object({ skip: z.number(), limit: z.number(), profile: z.string() }), requireAuth: true },
        async (data) => {
            const { query, ctx } = data

            if (!ctx.profiles.includes(query.profile)) {
                throw new AuthError("Access denied, you don't own this profile")
            }

            const profile = await getDoc<IProfile>('users', query.profile)

            return profile.curationList ?? []
        },
    ),
)

app.get(
    '/:curationListId/postIds',
    requestParser(
        {
            query: z.object({
                skip: z.number().gte(0).default(0),
                limit: z.number().lte(20).default(20),
                profile: z.string(),
            }),
            params: z.object({ curationListId: z.string() }),
            requireAuth: true,
        },
        async (data) => {
            const { query, params, ctx } = data

            if (!ctx.profiles.includes(query.profile)) {
                throw new AuthError("Access denied, you don't own this profile")
            }

            const profile = await getDoc<IProfile>('users', query.profile)
            const list = profile.curationList?.find((it) => it.id === params.curationListId)

            if (list == null) {
                throw new NotFoundError('Curation list not found')
            }

            const profiles = list.followedProfiles

            const posts = await getDocs<IPost>('posts', {
                filters: [{ path: 'profileId', ops: 'in', value: profiles }],
                orderBy: 'timeStamp',
                descending: true,
                skip: query.skip,
                limit: query.limit,
            })

            return posts
        },
    ),
)

export const curation = onRequest(commonOnRequestSettings, app)
