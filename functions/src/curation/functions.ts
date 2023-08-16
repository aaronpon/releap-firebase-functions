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

export async function createCurationList(data: { body: ICreateCurationListInput; ctx: RequestContext }) {
    const { profiles, publicKey } = data.ctx
    const payload = data.body
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

export async function renameCurationList(data: {
    body: IRenameCurationListInput
    ctx: RequestContext
    params: { curationListId: string }
}) {
    const { profiles } = data.ctx
    if (!profiles.includes(data.body.profile)) {
        throw new CustomError("Access denied, you don't own this profile", 401)
    }

    const profile = await getDoc<IProfile>('users', data.body.profile)

    profile.curationList = profile.curationList?.map((it) => {
        if (it.id === data.params.curationListId) {
            return {
                ...it,
                name: data.body.name,
            }
        } else {
            return it
        }
    })

    await storeDoc('users', data.body.profile, profile)
    return profile.curationList ?? []
}

export async function removeCurationList(data: {
    body: IRemoveCurationListInput
    ctx: RequestContext
    params: { curationListId: string }
}) {
    const { profiles } = data.ctx
    if (!profiles.includes(data.body.profile)) {
        throw new CustomError("Access denied, you don't own this profile", 401)
    }

    const profile = await getDoc<IProfile>('users', data.body.profile)

    profile.curationList = profile.curationList?.filter((it) => it.id !== data.params.curationListId)

    await storeDoc('users', data.body.profile, profile)
    return profile.curationList ?? []
}

export async function addProfileToCurationList(data: {
    body: IAddProfileToCurationListInput
    ctx: RequestContext
    params: { curationListId: string }
}) {
    const { profiles } = data.ctx
    if (!profiles.includes(data.body.profile)) {
        throw new CustomError("Access denied, you don't own this profile", 401)
    }

    const profile = await getDoc<IProfile>('users', data.body.profile)

    profile.curationList = profile.curationList?.map((it) => {
        if (it.id === data.params.curationListId) {
            return {
                ...it,
                followedProfiles: [...it.followedProfiles, data.body.profileToAdd],
            }
        } else {
            return it
        }
    })

    await storeDoc('users', data.body.profile, profile)
    return profile.curationList ?? []
}

export async function removeProfileFromCurationList(data: {
    body: IRemoveProfileFromCurationListInput
    ctx: RequestContext
    params: { curationListId: string; profileToRemove: string }
}) {
    const { profiles } = data.ctx
    if (!profiles.includes(data.body.profile)) {
        throw new CustomError("Access denied, you don't own this profile", 401)
    }

    const profile = await getDoc<IProfile>('users', data.body.profile)

    profile.curationList = profile.curationList?.map((it) => {
        if (it.id === data.params.curationListId) {
            return {
                ...it,
                followedProfiles: it.followedProfiles.filter((p) => p !== data.params.profileToRemove),
            }
        } else {
            return it
        }
    })

    await storeDoc('users', data.body.profile, profile)
    return profile.curationList ?? []
}
