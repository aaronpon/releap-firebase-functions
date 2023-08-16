import { onRequest } from 'firebase-functions/v2/https'
import { AddProfileToCurationListInput, CreateCurationListInput, RemoveCurationListInput } from './types'
import {
    addProfileToCurationList,
    createCurationList,
    removeCurationList,
    removeProfileFromCurationList,
    renameCurationList,
} from './functions'
import { commonOnRequestSettings, requestParser } from '../utils'
import express from 'express'
import { z } from 'zod'

const app = express()

app.post('/', requestParser({ body: CreateCurationListInput, requireAuth: true }, createCurationList))
app.put(
    '/:curationListId',
    requestParser(
        { body: CreateCurationListInput, params: z.object({ curationListId: z.string() }), requireAuth: true },
        renameCurationList,
    ),
)
app.delete(
    '/:curationListId',
    requestParser(
        { body: RemoveCurationListInput, params: z.object({ curationListId: z.string() }), requireAuth: true },
        removeCurationList,
    ),
)

app.post(
    '/:curationListId/profile',
    requestParser(
        { body: AddProfileToCurationListInput, params: z.object({ curationListId: z.string() }), requireAuth: true },
        addProfileToCurationList,
    ),
)
app.delete(
    '/:curationListId/profile/:profileToRemove',
    requestParser(
        {
            body: AddProfileToCurationListInput,
            params: z.object({ curationListId: z.string(), profileToRemove: z.string() }),
            requireAuth: true,
        },
        removeProfileFromCurationList,
    ),
)

export const curation = onRequest(commonOnRequestSettings, app)
