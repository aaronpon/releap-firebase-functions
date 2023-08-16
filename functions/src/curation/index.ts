import { onRequest } from 'firebase-functions/v2/https'
import { CurationRequest } from './types'
import {
    addProfileToCurationList,
    createCurationList,
    removeCurationList,
    removeProfileFromCurationList,
    renameCurationList,
} from './functions'
import { commonOnRequestSettings, requestParser } from '../utils'
//import express from 'express'

export const curation = onRequest(
    commonOnRequestSettings,
    requestParser({ body: CurationRequest, requireAuth: true }, async (payload) => {
        const { action, data } = payload.body
        const ctx = payload.ctx
        switch (action) {
            case 'createList':
                return await createCurationList(ctx, data)
            case 'renameList':
                return await renameCurationList(ctx, data)
            case 'removeList':
                return await removeCurationList(ctx, data)
            case 'addProfileToList':
                return await addProfileToCurationList(ctx, data)
            case 'removeProfileFromList':
                return await removeProfileFromCurationList(ctx, data)
        }
    }),
)

/*
const app = express()

app.post('/', () => {})
app.put('/:id', () => {})
app.delete('/:id', () => {})
app.post('/id/profile/:profileToFollow', () => {})
app.delete('/:id/profile/:profileToRemove', () => {})
*/
