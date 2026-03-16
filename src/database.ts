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
    blockCount: number
    lastBlockNotifyTime: number
}

export interface GroupBotStatus {
    platform: string
    guildId: string
    botEnabled: boolean
}

export interface SmallGroupWhitelist {
    platform: string
    guildId: string
}

export interface PendingInvite {
    platform: string
    groupId: string
    userId: string
    userName: string
    groupName: string
    time: number
    flag: string
}

export interface PendingFriendRequest {
    platform: string
    userId: string
    nickname: string
    comment: string
    flag: string
    time: number
}

declare module 'koishi' {
    interface Tables {
        blacklisted_guild: BlacklistedGuild
        command_frequency_record: CommandFrequencyRecord
        group_bot_status: GroupBotStatus
        small_group_whitelist: SmallGroupWhitelist
        pending_invite: PendingInvite
        pending_friend_request: PendingFriendRequest
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
        blockCount: 'integer',
        lastBlockNotifyTime: 'integer',
    }, { primary: ['platform', 'guildId'] })

    ctx.model.extend('group_bot_status', {
        platform: 'string',
        guildId: 'string',
        botEnabled: 'boolean',
    }, { primary: ['platform', 'guildId'] })

    ctx.model.extend('small_group_whitelist', {
        platform: 'string',
        guildId: 'string',
    }, { primary: ['platform', 'guildId'] })

    ctx.model.extend('pending_invite', {
        platform: 'string',
        groupId: 'string',
        userId: 'string',
        userName: 'string',
        groupName: 'string',
        time: 'integer',
        flag: 'string',
    }, { primary: ['platform', 'groupId'] })

    ctx.model.extend('pending_friend_request', {
        platform: 'string',
        userId: 'string',
        nickname: 'string',
        comment: 'string',
        flag: 'string',
        time: 'integer',
    }, { primary: ['platform', 'userId'] })
}

export const BLACKLIST_PLATFORM = 'onebot';

export async function getBlacklistedGuild(ctx: Context, guildId: string) {
    return await ctx.model.get('blacklisted_guild', { platform: BLACKLIST_PLATFORM, guildId });
}

export async function removeBlacklistedGuild(ctx: Context, guildId: string) {
    return await ctx.model.remove('blacklisted_guild', { platform: BLACKLIST_PLATFORM, guildId });
}

export async function createBlacklistedGuild(ctx: Context, guildId: string, reason: string) {
    return await ctx.model.upsert('blacklisted_guild', [{
        platform: BLACKLIST_PLATFORM,
        guildId,
        timestamp: Math.floor(Date.now() / 1000),
        reason
    }]);
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

// 小群白名单管理
export async function isInSmallGroupWhitelist(ctx: Context, guildId: string): Promise<boolean> {
    const records = await ctx.model.get('small_group_whitelist', { platform: BLACKLIST_PLATFORM, guildId });
    return records.length > 0;
}

export async function addToSmallGroupWhitelist(ctx: Context, guildId: string) {
    await ctx.model.upsert('small_group_whitelist', [{ platform: BLACKLIST_PLATFORM, guildId }]);
}

export async function removeFromSmallGroupWhitelist(ctx: Context, guildId: string) {
    await ctx.model.remove('small_group_whitelist', { platform: BLACKLIST_PLATFORM, guildId });
}

export async function getAllSmallGroupWhitelist(ctx: Context) {
    return await ctx.model.get('small_group_whitelist', { platform: BLACKLIST_PLATFORM });
}

// 待处理邀请管理
export async function getPendingInvite(ctx: Context, groupId: string) {
    const records = await ctx.model.get('pending_invite', { platform: BLACKLIST_PLATFORM, groupId });
    return records.length > 0 ? records[0] : null;
}

export async function addPendingInvite(ctx: Context, inviteUser: Omit<PendingInvite, 'platform'>) {
    await ctx.model.upsert('pending_invite', [{ platform: BLACKLIST_PLATFORM, ...inviteUser }]);
}

export async function removePendingInvite(ctx: Context, groupId: string) {
    await ctx.model.remove('pending_invite', { platform: BLACKLIST_PLATFORM, groupId });
}

export async function getAllPendingInvites(ctx: Context) {
    return await ctx.model.get('pending_invite', { platform: BLACKLIST_PLATFORM });
}

export async function clearExpiredPendingInvites(ctx: Context, expireTimeMs: number) {
    const cutoff = Date.now() - expireTimeMs;
    const all = await ctx.model.get('pending_invite', { platform: BLACKLIST_PLATFORM });
    const expired = all.filter(r => r.time < cutoff);
    for (const record of expired) {
        await ctx.model.remove('pending_invite', { platform: BLACKLIST_PLATFORM, groupId: record.groupId });
    }
    return expired.length;
}

// 待处理好友申请管理
export async function getPendingFriendRequest(ctx: Context, platform: string, userId: string) {
    const records = await ctx.model.get('pending_friend_request', { platform, userId });
    return records.length > 0 ? records[0] : null;
}

export async function addPendingFriendRequest(ctx: Context, platform: string, data: Omit<PendingFriendRequest, 'platform'>) {
    await ctx.model.upsert('pending_friend_request', [{ platform, ...data }]);
}

export async function removePendingFriendRequest(ctx: Context, platform: string, userId: string) {
    await ctx.model.remove('pending_friend_request', { platform, userId });
}

export async function getAllPendingFriendRequests(ctx: Context, platform: string) {
    return await ctx.model.get('pending_friend_request', { platform });
}

export async function clearExpiredPendingFriendRequests(ctx: Context, platform: string, expireTimeMs: number) {
    const cutoff = Date.now() - expireTimeMs;
    const all = await ctx.model.get('pending_friend_request', { platform });
    const expired = all.filter(r => r.time < cutoff);
    for (const record of expired) {
        await ctx.model.remove('pending_friend_request', { platform, userId: record.userId });
    }
    return expired.length;
}
