import { CustomError } from '../error'
import { RequestContext } from '../types'
import {
    IAddProfileToCurationListInput,
    ICreateCurationListInput,
    IRemoveCurationListInput,
    IRemoveProfileFromCurationListInput,
    IRenameCurationListInput,
} from './types'

export async function createCurationList(ctx: RequestContext, payload: ICreateCurationListInput['data']) {
    const { profiles } = ctx
    if (!profiles.includes(payload.profile)) {
        throw new CustomError("Access denied, you don't own this profile", 401)
    }
}

export async function renameCurationList(ctx: RequestContext, payload: IRenameCurationListInput['data']) {
    const { profiles } = ctx
    if (!profiles.includes(payload.profile)) {
        throw new CustomError("Access denied, you don't own this profile", 401)
    }
}

export async function removeCurationList(ctx: RequestContext, payload: IRemoveCurationListInput['data']) {
    const { profiles } = ctx
    if (!profiles.includes(payload.profile)) {
        throw new CustomError("Access denied, you don't own this profile", 401)
    }
}

export async function addProfileToCurationList(ctx: RequestContext, payload: IAddProfileToCurationListInput['data']) {
    const { profiles } = ctx
    if (!profiles.includes(payload.profile)) {
        throw new CustomError("Access denied, you don't own this profile", 401)
    }
}

export async function removeProfileFromCurationList(
    ctx: RequestContext,
    payload: IRemoveProfileFromCurationListInput['data'],
) {
    const { profiles } = ctx
    if (!profiles.includes(payload.profile)) {
        throw new CustomError("Access denied, you don't own this profile", 401)
    }
}
