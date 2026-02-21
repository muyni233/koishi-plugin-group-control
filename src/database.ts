import { Context } from 'koishi'

export interface BlacklistedGuild {
    platform: string
    guildId: string
    timestamp: number
    reason: string
}

export interface CommandFrequencyRecord {
    platform: string
    guildId: string
    commandCount: number
    lastCommandTime: number
    warningSent: boolean
    blockExpiryTime: number
    firstWarningTime: number
}

export interface GroupBotStatus {
    platform: string
    guildId: string
    botEnabled: boolean
}

declare module 'koishi' {
    interface Tables {
        blacklisted_guild: BlacklistedGuild
        command_frequency_record: CommandFrequencyRecord
        group_bot_status: GroupBotStatus
    }
}

export const name = 'group-control-database'

export function apply(ctx: Context) {
    ctx.model.extend('blacklisted_guild', {
        platform: 'string',
        guildId: 'string',
        timestamp: 'integer',
        reason: 'string',
    }, { primary: ['platform', 'guildId'] })

    ctx.model.extend('command_frequency_record', {
        platform: 'string',
        guildId: 'string',
        commandCount: 'integer',
        lastCommandTime: 'integer',
        warningSent: 'boolean',
        blockExpiryTime: 'integer',
        firstWarningTime: 'integer',
    }, { primary: ['platform', 'guildId'] })

    ctx.model.extend('group_bot_status', {
        platform: 'string',
        guildId: 'string',
        botEnabled: 'boolean',
    }, { primary: ['platform', 'guildId'] })
}

export const BLACKLIST_PLATFORM = 'onebot';

export async function getBlacklistedGuild(ctx: Context, guildId: string) {
    return await ctx.model.get('blacklisted_guild', { platform: BLACKLIST_PLATFORM, guildId });
}

export async function removeBlacklistedGuild(ctx: Context, guildId: string) {
    return await ctx.model.remove('blacklisted_guild', { platform: BLACKLIST_PLATFORM, guildId });
}

export async function createBlacklistedGuild(ctx: Context, guildId: string, reason: string) {
    return await ctx.model.create('blacklisted_guild', {
        platform: BLACKLIST_PLATFORM,
        guildId,
        timestamp: Math.floor(Date.now() / 1000),
        reason
    });
}

export async function getAllBlacklistedGuilds(ctx: Context) {
    return await ctx.model.get('blacklisted_guild', { platform: BLACKLIST_PLATFORM });
}

export async function clearBlacklistedGuilds(ctx: Context) {
    return await ctx.model.remove('blacklisted_guild', { platform: BLACKLIST_PLATFORM });
}

export async function getCommandFrequencyRecord(ctx: Context, platform: string, guildId: string) {
    const records = await ctx.model.get('command_frequency_record', { platform, guildId });
    return records.length > 0 ? records[0] : null;
}

export async function updateCommandFrequencyRecord(ctx: Context, platform: string, guildId: string, data: Partial<CommandFrequencyRecord>) {
    await ctx.model.upsert('command_frequency_record', [{
        platform,
        guildId,
        ...data
    }]);
}

export async function getGroupBotStatus(ctx: Context, platform: string, guildId: string): Promise<GroupBotStatus | null> {
    const records = await ctx.model.get('group_bot_status', { platform, guildId });
    return records.length > 0 ? records[0] : null;
}

export async function setGroupBotStatus(ctx: Context, platform: string, guildId: string, botEnabled: boolean) {
    await ctx.model.upsert('group_bot_status', [{ platform, guildId, botEnabled }]);
}
