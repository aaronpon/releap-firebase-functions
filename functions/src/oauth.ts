import OAuth from 'oauth-1.0a'
import { Request } from 'firebase-functions/v2/https'
import { Response } from 'express'
import { createHmac } from 'crypto'
import axios from 'axios'
import * as logger from 'firebase-functions/logger'
import { updateUserDiscordData, updateUserTwitterData } from './firestore'
import { RequestContext } from './types'
import { AuthError } from './error'

async function requestTwitterAccessToken({ oauthToken, oauthVerifier }: { oauthToken: string; oauthVerifier: string }) {
    const twitterOauth: OAuth = new OAuth({
        consumer: {
            key: process.env.TWITTER_COMSUMER_KEY as string,
            secret: process.env.TWITTER_COMSUMER_SECRET as string,
        },
        signature_method: 'HMAC-SHA1',
        hash_function: (data, key) => {
            return createHmac('sha1', key).update(data).digest('base64')
        },
    })
    const config = {
        url: `https://api.twitter.com/oauth/access_token`,
        method: 'POST',
        data: { oauth_token: oauthToken, oauth_verifier: oauthVerifier },
    }

    const headers = twitterOauth.toHeader(twitterOauth.authorize(config))

    try {
        const { data } = await axios<string>({
            method: config.method,
            url: `${config.url}`, //?oauth_token=${oauthToken}&oauth_verifier=${oauthVerifier}`,
            headers: {
                ...headers,
            },
        })

        const map = data.split('&').reduce<Record<string, string>>((acc, curr: string) => {
            const [key, value] = curr.split('=')
            acc[key] = value
            return acc
        }, {})

        if (map['user_id'] == null || map['screen_name'] == null) {
            throw new Error('unexpected twitter access_token response')
        }

        return map as { user_id: string; screen_name: string }
    } catch (err) {
        logger.error(err)
        throw err
    }
}

export async function requestTwitterOAuthCode(ctx: RequestContext, req: Request, res: Response) {
    const twitterOauth: OAuth = new OAuth({
        consumer: {
            key: process.env.TWITTER_COMSUMER_KEY as string,
            secret: process.env.TWITTER_COMSUMER_SECRET as string,
        },
        signature_method: 'HMAC-SHA1',
        hash_function: (data, key) => {
            return createHmac('sha1', key).update(data).digest('base64')
        },
    })
    const { redirectUrl } = req.body.data
    const config = {
        url: `https://api.twitter.com/oauth/request_token`,
        method: 'POST',
        data: { oauth_callback: redirectUrl },
    }
    const headers = twitterOauth.toHeader(twitterOauth.authorize(config))

    try {
        const { data } = await axios<string>({
            method: config.method,
            url: config.url,
            headers: {
                ...headers,
            },
        })

        const map = data.split('&').reduce<Record<string, string>>((acc, curr: string) => {
            const [key, value] = curr.split('=')
            acc[key] = value
            return acc
        }, {})

        if (
            map['oauth_token'] == null ||
            map['oauth_token_secret'] == null ||
            map['oauth_callback_confirmed'] == null
        ) {
            throw new Error('unexpected twitter request_token response')
        }

        res.status(200).json({
            oauthToken: map['oauth_token'] as string,
            oauthTokenSecret: map['oauth_token_secret'] as string,
            oauthCallbackConfirmed: map['oauth_callback_confirmed'] as string,
        })
    } catch (err) {
        logger.error(err)
        throw err
    }
}

export async function connectTwitter(ctx: RequestContext, req: Request, res: Response) {
    const { profile, oauthToken, oauthVerifier } = req.body.data
    if (!ctx.profiles.includes(profile)) {
        throw new AuthError("You don't own this profile")
    }

    logger.info({ oauthToken, oauthVerifier })

    const { user_id, screen_name } = await requestTwitterAccessToken({
        oauthToken,
        oauthVerifier,
    })

    await updateUserTwitterData(profile, user_id, screen_name)
    res.status(200).json({ success: true })
}

export async function disconnectTwitter(ctx: RequestContext, req: Request, res: Response) {
    const { profile } = req.body.data
    if (!ctx.profiles.includes(profile)) {
        throw new AuthError("You don't own this profile")
    }
    await updateUserTwitterData(profile, null, null)
    res.status(200).json({ success: true })
}

interface DiscordAuthResponse {
    access_token: string
    expires_in: number
    refresh_token: string
    scope: string
    token_type: string
}

interface DiscordProfileResponse {
    id: string
    username: string
    discriminator: string
}

export async function connectDiscord(ctx: RequestContext, req: Request, res: Response) {
    const { code, redirectUri, profile } = req.body.data
    if (!ctx.profiles.includes(profile)) {
        throw new AuthError("You don't own this profile")
    }
    try {
        const data = new URLSearchParams()
        data.append('client_id', process.env.DISCORD_CLIENT_ID as string)
        data.append('client_secret', process.env.DISCORD_CLIENT_SECRET as string)
        data.append('grant_type', 'authorization_code')
        data.append('scope', 'identify')
        data.append('code', code)
        data.append('redirect_uri', redirectUri)

        const authResponse = await axios.post<DiscordAuthResponse>(`https://discord.com/api/oauth2/token`, data)

        const profileResponse = await axios.get<DiscordProfileResponse>('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${authResponse.data.access_token}` },
        })

        const { username, id, discriminator } = profileResponse.data

        await updateUserDiscordData(profile, id, `${username}#${discriminator}`)

        res.status(200).json({ success: true })
    } catch (err) {
        res.status(400).json({ success: false })
        logger.error(err)
        throw new Error(`Fail to connect discord, profile address ${profile}`)
    }
}
