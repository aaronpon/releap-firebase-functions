import { DiscordServer, RequestContext, VerifyDiscordServer } from './types'
import { REST } from 'discord.js'
import { API } from '@discordjs/core'
import { getDoc, storeDoc } from './firestore'
import { AuthError, BadRequest } from './error'
import { z } from 'zod'

export async function verifyDiscordServer(ctx: RequestContext, data: z.infer<typeof VerifyDiscordServer>['data']) {
    const { profileId, discordServerId, roleId } = data

    const { profiles } = ctx
    if (!profiles.includes(profileId)) {
        throw new AuthError("You don't own this profile")
    }

    const serverVerified = await verifiyDiscordServerAccess(discordServerId, profileId)
    const roleVerified = await verifyDiscordServerRole(discordServerId, roleId)

    if (serverVerified && roleVerified) {
        return { success: true }
    } else {
        throw new BadRequest('Fail to fetch discord server info')
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
