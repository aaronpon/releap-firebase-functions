import { Request } from 'firebase-functions/v2/https'
import { Response } from 'express'
import { DiscordServer, RequestContext } from './types'
import { REST } from 'discord.js'
import { API } from '@discordjs/core'
import { VerifyDiscordServerInput } from './inputType'
import { getDoc, storeDoc } from './firestore'

export async function verifyDiscordServer(ctx: RequestContext, req: Request, res: Response) {
    const parseResult = await VerifyDiscordServerInput.safeParseAsync(req.body.data)

    if (!parseResult.success) {
        res.status(400).send(parseResult.error.message).end()
        return
    }

    const { profileId, discordServerId, roleId } = parseResult.data

    const { profiles } = ctx
    if (!profiles.includes(profileId)) {
        res.status(401).send("You don't own this profile").end()
        return
    }

    const serverVerified = await verifiyDiscordServerAccess(discordServerId, profileId)
    const roleVerified = await verifyDiscordServerRole(discordServerId, roleId)

    if (serverVerified && roleVerified) {
        res.status(200).json({ success: true }).end()
    } else {
        res.status(400).send('Fail to fetch discord server indo').end()
    }
}

export async function verifyDiscordServerRole(serverId: string, roleId: string) {
    try {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN as string)
        const api = new API(rest)
        const roles = await api.guilds.getRoles(serverId)
        const role = roles.find((role) => role.id === roleId)
        return role != null
    } catch (err) {
        return false
    }
}

export async function verifiyDiscordServerAccess(serverId: string, profileId: string) {
    const server = await getDoc<DiscordServer>('discordServers', serverId)

    if (server != null && server.ownerProfile != profileId) {
        return false
    }
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN as string)
    const api = new API(rest)

    try {
        await api.guilds.get(serverId)
        await storeDoc<DiscordServer>('discordServers', serverId, {
            ownerProfile: profileId,
            serverId: serverId,
        })
        return true
    } catch (err) {
        return false
    }
}

export async function assignRole({ serverId, roleId, userId }: { serverId: string; roleId: string; userId: string }) {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN as string)
    const api = new API(rest)
    await api.guilds.addRoleToMember(serverId, userId, roleId)
}

export async function assertUserInServer(serverId: string, userId: string) {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN as string)
    const api = new API(rest)

    try {
        await api.guilds.getMember(serverId, userId)
        return true
    } catch (err) {
        return false
    }
}
