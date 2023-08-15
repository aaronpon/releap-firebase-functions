import { randomUUID } from 'crypto'
import { BadRequest, CustomError } from '../error'
import { getDoc } from '../firestore'
import { getVeReapAmount } from '../governance/utils'
import { IProfile, RequestContext } from '../types'
import {
    IAddProfileToCurationListInput,
    ICreateCurationListInput,
    IRemoveCurationListInput,
    IRemoveProfileFromCurationListInput,
    IRenameCurationListInput,
} from './types'
import { storeDoc } from '../firestore'

// temp value
const veReapAndCurationListCount = [
    { minVeReap: 0, count: 1 },
    { minVeReap: 5000, count: 2 },
    { minVeReap: 500000, count: 5 },
]

export async function createCurationList(ctx: RequestContext, payload: ICreateCurationListInput['data']) {
    const { profiles, publicKey } = ctx
    if (!profiles.includes(payload.profile)) {
        throw new CustomError("Access denied, you don't own this profile", 401)
    }

    const veReap = await getVeReapAmount('sui', publicKey)

    const maxAllowdCount = veReapAndCurationListCount.reduce(
        (acc, curr) => (veReap >= curr.minVeReap && curr.count > acc ? curr.count : acc),
        0,
    )

    const profile = await getDoc<IProfile>('users', payload.profile)

    if ((profile?.curationList?.length ?? 0) >= maxAllowdCount) {
        throw new BadRequest('Need to stake more REAP to create curation list')
    }

    if (profile?.curationList?.some((it) => it.name === payload.name)) {
        throw new BadRequest('You already have a curation has the same name')
    }

    profile.curationList = profile.curationList ?? []

    profile.curationList.push({
        id: randomUUID(),
        name: payload.name,
        followedProfiles: [],
    })

    await storeDoc('users', payload.profile, profile)

    return profile.curationList
}

export async function renameCurationList(ctx: RequestContext, payload: IRenameCurationListInput['data']) {
    const { profiles } = ctx
    if (!profiles.includes(payload.profile)) {
        throw new CustomError("Access denied, you don't own this profile", 401)
    }

    const profile = await getDoc<IProfile>('users', payload.profile)

    profile.curationList = profile.curationList?.map((it) => {
        if (it.id === payload.id) {
            return {
                ...it,
                name: payload.name,
            }
        } else {
            return it
        }
    })

    await storeDoc('users', payload.profile, profile)
    return profile.curationList
}

export async function removeCurationList(ctx: RequestContext, payload: IRemoveCurationListInput['data']) {
    const { profiles } = ctx
    if (!profiles.includes(payload.profile)) {
        throw new CustomError("Access denied, you don't own this profile", 401)
    }

    const profile = await getDoc<IProfile>('users', payload.profile)

    profile.curationList = profile.curationList?.filter((it) => it.id !== payload.id)

    await storeDoc('users', payload.profile, profile)
    return profile.curationList
}

export async function addProfileToCurationList(ctx: RequestContext, payload: IAddProfileToCurationListInput['data']) {
    const { profiles } = ctx
    if (!profiles.includes(payload.profile)) {
        throw new CustomError("Access denied, you don't own this profile", 401)
    }

    const profile = await getDoc<IProfile>('users', payload.profile)

    profile.curationList = profile.curationList?.map((it) => {
        if (it.id === payload.id) {
            return {
                ...it,
                followedProfiles: [...it.followedProfiles, payload.profileToAdd],
            }
        } else {
            return it
        }
    })

    await storeDoc('users', payload.profile, profile)
    return profile.curationList
}

export async function removeProfileFromCurationList(
    ctx: RequestContext,
    payload: IRemoveProfileFromCurationListInput['data'],
) {
    const { profiles } = ctx
    if (!profiles.includes(payload.profile)) {
        throw new CustomError("Access denied, you don't own this profile", 401)
    }

    const profile = await getDoc<IProfile>('users', payload.profile)

    profile.curationList = profile.curationList?.map((it) => {
        if (it.id === payload.id) {
            return {
                ...it,
                followedProfiles: it.followedProfiles.filter((p) => p !== payload.profileToRemove),
            }
        } else {
            return it
        }
    })

    await storeDoc('users', payload.profile, profile)
    return profile.curationList
}
