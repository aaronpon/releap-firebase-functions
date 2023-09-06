import express from 'express'
import { onRequest } from 'firebase-functions/v2/https'
import { commonOnRequestSettings, requestParser } from '../utils'
import { z } from 'zod'
import { BadRequest } from '../error'
import { getDoc, storeDoc } from '../firestore'
import { IProfile, IWallet } from '../types'
import { createProfileToken } from './functions'

const MIN_VEREAP_MINT_PROFILE_TOKEN = 100_000
const app = express()

app.post(
    '/token',
    requestParser({ body: z.object({ profile: z.string() }), requireAuth: true, signer: true }, async (data) => {
        const {
            ctx: { publicKey },
            body: { profile },
        } = data

        const [targetProfile, userWallet] = await Promise.all([
            getDoc<IProfile>('users', profile),
            getDoc<IWallet>('wallets', publicKey),
        ])

        if (targetProfile == null) {
            throw new BadRequest('Incorrect profile')
        }

        if (targetProfile.profileTokenType != null) {
            throw new BadRequest('Profile already has profile token created')
        }

        if (userWallet == null || userWallet.veReap < MIN_VEREAP_MINT_PROFILE_TOKEN) {
            throw new BadRequest('Not enough veReap')
        }

        const updatedProfile = await createProfileToken(targetProfile, { signer: data.signer })

        await storeDoc<IProfile>('users', targetProfile.profileId, updatedProfile)

        return updatedProfile
    }),
)

export const profile = onRequest(
    { ...commonOnRequestSettings, secrets: [...commonOnRequestSettings.secrets, 'SEED_PHRASE'] },
    app,
)
