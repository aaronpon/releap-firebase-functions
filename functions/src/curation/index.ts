import { onRequest } from 'firebase-functions/v2/https'
import { CurationRequest } from './types'
import { getRequestContext } from '../auth'
import {
    addProfileToCurationList,
    createCurationList,
    removeCurationList,
    removeProfileFromCurationList,
    renameCurationList,
} from './functions'
import { BadRequest } from '../error'
import { errorCaptured } from '../utils'

export const curation = onRequest(
    {
        cors: [/localhost/, /.*\.releap\.xyz$/, /localhost:3000/, /.*\.d1doiqjkpgeoca\.amplifyapp\.com/],
        timeoutSeconds: 180,
    },
    errorCaptured(async (req, res) => {
        const parsed = await CurationRequest.safeParseAsync(req.body)

        if (!parsed.success) {
            throw new BadRequest(parsed.error.message)
        }

        const { action, data } = parsed.data

        const ctx = getRequestContext(req)

        let result
        switch (action) {
            case 'createList':
                result = await createCurationList(ctx, data)
                break
            case 'renameList':
                result = await renameCurationList(ctx, data)
                break
            case 'removeList':
                result = await removeCurationList(ctx, data)
                break
            case 'addProfileToList':
                result = await addProfileToCurationList(ctx, data)
                break
            case 'removeProfileFromList':
                result = await removeProfileFromCurationList(ctx, data)
                break
        }

        res.status(200).json(result)
    }),
)
