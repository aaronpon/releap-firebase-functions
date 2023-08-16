import { onRequest } from 'firebase-functions/v2/https'
import { CurationRequest } from './types'
import {
    addProfileToCurationList,
    createCurationList,
    removeCurationList,
    removeProfileFromCurationList,
    renameCurationList,
} from './functions'
import { commonOnRequestSettings, parseRequestBodyWithCtx } from '../utils'

export const curation = onRequest(
    commonOnRequestSettings,
    parseRequestBodyWithCtx(CurationRequest, async (ctx, payload) => {
        const { action, data } = payload
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
