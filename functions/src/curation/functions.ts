import { randomUUID } from 'crypto'
import { AuthError, BadRequest } from '../error'
import { getDoc, getDocs } from '../firestore'
import { getVeReapAmount } from '../governance/utils'
import { IProfile, RequestContext } from '../types'
import { ICreateCurationListInput, IRemoveCurationListInput, IUpdateCurationListInput } from './types'
import { storeDoc } from '../firestore'
import { validateProfileNames } from '../utils'

// temp value
const veReapAndCurationListCount = [
    { minVeReap: 0, count: 1 },
    { minVeReap: 5000, count: 2 },
    { minVeReap: 500000, count: 5 },
]

export async function createCurationList(data: { body: ICreateCurationListInput; ctx: RequestContext }) {
    const { profiles, publicKey, provider } = data.ctx
    const payload = data.body
    if (!profiles.includes(payload.profile)) {
        throw new AuthError("Access denied, you don't own this profile")
    }

    const veReap = await getVeReapAmount('sui', publicKey)

    const maxAllowdCount = veReapAndCurationListCount.reduce(
        (acc, curr) => (veReap >= curr.minVeReap && curr.count > acc ? curr.count : acc),
        0,
    )

    const profile = await getDoc<IProfile>('users', payload.profile)

    if ((profile?.curationList?.length ?? 0) >= maxAllowdCount) {
        throw new BadRequest('Need to stake more REAP to create more curation list')
    }

    if (profile?.curationList?.some((it) => it.name === payload.name)) {
        throw new BadRequest('You already have a curation has the same name')
    }

    const invalidProfiles = await validateProfileNames(provider, data.body.followedProfileNames)

    if (invalidProfiles.length > 0) {
        throw new BadRequest(`The following profile names are invalid: ${JSON.stringify(invalidProfiles)}`)
    }

    const profilesToFollow = await getDocs<IProfile>('users', {
        filters: [{ path: 'name', ops: 'in', value: data.body.followedProfileNames }],
    })

    const followedProfiles: string[] = profilesToFollow.map((it) => it.profileId)

    profile.curationList = profile.curationList ?? []

    profile.curationList.push({
        id: randomUUID(),
        name: payload.name,
        followedProfiles,
    })

    await storeDoc('users', payload.profile, profile)

    return profile.curationList
}

export async function updateCurationList(data: {
    body: IUpdateCurationListInput
    ctx: RequestContext
    params: { curationListId: string }
}) {
    const { profiles } = data.ctx
    if (!profiles.includes(data.body.profile)) {
        throw new AuthError("Access denied, you don't own this profile")
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
        throw new AuthError("Access denied, you don't own this profile")
    }

    const profile = await getDoc<IProfile>('users', data.body.profile)

    profile.curationList = profile.curationList?.filter((it) => it.id !== data.params.curationListId)

    await storeDoc('users', data.body.profile, profile)
    return profile.curationList ?? []
}
