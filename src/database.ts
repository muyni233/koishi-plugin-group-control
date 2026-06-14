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

export interface ApprovedGuild {
    platform: string
    guildId: string
    timestamp: number
}

export interface SelfLeftGuild {
    platform: string
    guildId: string
    timestamp: number
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
        self_left_guild: SelfLeftGuild
        approved_guild: ApprovedGuild
        pending_invite: PendingInvite
        pending_friend_request: PendingFriendRequest
    }
}

export const name = 'group-control-database'

export function apply(ctx: Context) {
    ctx.on('dispose', () => {
        groupBotStatusCache.clear();
    });

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

    ctx.model.extend('self_left_guild', {
        platform: 'string',
        guildId: 'string',
        timestamp: 'integer',
    }, { primary: ['platform', 'guildId'] })

    ctx.model.extend('approved_guild', {
        platform: 'string',
        guildId: 'string',
        timestamp: 'integer',
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
    return await ctx.database.get('blacklisted_guild', { platform: BLACKLIST_PLATFORM, guildId });
}

export async function removeBlacklistedGuild(ctx: Context, guildId: string) {
    return await ctx.database.remove('blacklisted_guild', { platform: BLACKLIST_PLATFORM, guildId });
}

export async function createBlacklistedGuild(ctx: Context, guildId: string, reason: string) {
    return await ctx.database.upsert('blacklisted_guild', [{
        platform: BLACKLIST_PLATFORM,
        guildId,
        timestamp: Math.floor(Date.now() / 1000),
        reason
    }]);
}

export async function getAllBlacklistedGuilds(ctx: Context) {
    return await ctx.database.get('blacklisted_guild', { platform: BLACKLIST_PLATFORM });
}

export async function clearBlacklistedGuilds(ctx: Context) {
    return await ctx.database.remove('blacklisted_guild', { platform: BLACKLIST_PLATFORM });
}

/** 统一写入被踢黑名单行，保证 platform = BLACKLIST_PLATFORM */
export async function blacklistKicked(ctx: Context, guildId: string) {
    return await ctx.database.upsert('blacklisted_guild', [{
        platform: BLACKLIST_PLATFORM,
        guildId,
        timestamp: Math.floor(Date.now() / 1000),
        reason: 'kicked',
    }]);
}

// ── 持久化「主动退群」标记，用于 guild-removed 区分主动退 vs 被踢 ──

/** 在主动退群前写入标记，让 guild-removed 能区分「自己退的」和「被踢的」*/
export async function markSelfLeft(ctx: Context, guildId: string) {
    await ctx.database.upsert('self_left_guild', [{
        platform: BLACKLIST_PLATFORM,
        guildId,
        timestamp: Math.floor(Date.now() / 1000),
    }]);
}

/** 消费标记（单次读取后删除），返回是否在 maxAgeSec 内。用于 guild-removed 判断是自己退的 */
export async function consumeSelfLeft(ctx: Context, guildId: string, maxAgeSec = 120): Promise<boolean> {
    const [row] = await ctx.database.get('self_left_guild', { platform: BLACKLIST_PLATFORM, guildId });
    if (!row) return false;
    // 无论超不超时都清理，防止堆积
    await ctx.database.remove('self_left_guild', { platform: BLACKLIST_PLATFORM, guildId });
    return (Math.floor(Date.now() / 1000) - row.timestamp) <= maxAgeSec;
}

/** 清理标记（退群失败时回滚，或 unban 时清理）*/
export async function clearSelfLeft(ctx: Context, guildId: string) {
    await ctx.database.remove('self_left_guild', { platform: BLACKLIST_PLATFORM, guildId });
}

/** 定期清理过期的主动退群标记（超过 maxAgeSec 秒未消费的）*/
export async function clearExpiredSelfLeft(ctx: Context, maxAgeSec = 300) {
    const cutoff = Math.floor(Date.now() / 1000) - maxAgeSec;
    // 单次条件批量删除，避免全表拉取 + 逐行删除（N+1）
    await ctx.database.remove('self_left_guild', { platform: BLACKLIST_PLATFORM, timestamp: { $lt: cutoff } });
}

export async function getCommandFrequencyRecord(ctx: Context, platform: string, guildId: string) {
    const records = await ctx.database.get('command_frequency_record', { platform, guildId });
    return records.length > 0 ? records[0] : null;
}

export async function updateCommandFrequencyRecord(ctx: Context, platform: string, guildId: string, data: Partial<CommandFrequencyRecord>) {
    await ctx.database.upsert('command_frequency_record', [{
        platform,
        guildId,
        ...data
    }]);
}

const GROUP_BOT_STATUS_CACHE_TTL = 5 * 60 * 1000;
const GROUP_BOT_STATUS_CACHE_MAX = 1000;

interface GroupBotStatusCacheEntry {
    value: GroupBotStatus | null
    expiresAt: number
}

const groupBotStatusCache = new Map<string, GroupBotStatusCacheEntry>();
const groupBotStatusCacheKey = (platform: string, guildId: string) => `${platform}:${guildId}`;

function pruneGroupBotStatusCache(now = Date.now()) {
    for (const [key, entry] of groupBotStatusCache) {
        if (entry.expiresAt <= now) groupBotStatusCache.delete(key);
    }
    while (groupBotStatusCache.size > GROUP_BOT_STATUS_CACHE_MAX) {
        const oldestKey = groupBotStatusCache.keys().next().value;
        if (!oldestKey) break;
        groupBotStatusCache.delete(oldestKey);
    }
}

function getCachedGroupBotStatus(key: string): GroupBotStatus | null | undefined {
    const entry = groupBotStatusCache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
        groupBotStatusCache.delete(key);
        return undefined;
    }
    groupBotStatusCache.delete(key);
    groupBotStatusCache.set(key, entry);
    return entry.value;
}

function setCachedGroupBotStatus(key: string, value: GroupBotStatus | null) {
    groupBotStatusCache.set(key, { value, expiresAt: Date.now() + GROUP_BOT_STATUS_CACHE_TTL });
    pruneGroupBotStatusCache();
}

export async function getGroupBotStatus(ctx: Context, platform: string, guildId: string): Promise<GroupBotStatus | null> {
    const key = groupBotStatusCacheKey(platform, guildId);
    const cached = getCachedGroupBotStatus(key);
    if (cached !== undefined) return cached;
    const records = await ctx.database.get('group_bot_status', { platform, guildId });
    const status = records.length > 0 ? records[0] : null;
    setCachedGroupBotStatus(key, status);
    return status;
}

export async function setGroupBotStatus(ctx: Context, platform: string, guildId: string, botEnabled: boolean) {
    await ctx.database.upsert('group_bot_status', [{ platform, guildId, botEnabled }]);
    setCachedGroupBotStatus(groupBotStatusCacheKey(platform, guildId), { platform, guildId, botEnabled });
}

// 小群白名单管理
export async function isInSmallGroupWhitelist(ctx: Context, guildId: string): Promise<boolean> {
    const records = await ctx.database.get('small_group_whitelist', { platform: BLACKLIST_PLATFORM, guildId });
    return records.length > 0;
}

export async function addToSmallGroupWhitelist(ctx: Context, guildId: string) {
    await ctx.database.upsert('small_group_whitelist', [{ platform: BLACKLIST_PLATFORM, guildId }]);
}

export async function removeFromSmallGroupWhitelist(ctx: Context, guildId: string) {
    await ctx.database.remove('small_group_whitelist', { platform: BLACKLIST_PLATFORM, guildId });
}

export async function getAllSmallGroupWhitelist(ctx: Context) {
    return await ctx.database.get('small_group_whitelist', { platform: BLACKLIST_PLATFORM });
}

// 已审核/已自动通过的群（持久化）。
// 用于让审核放行的群永久豁免小群检测（含实时监控）；机器人退群时清除，
// 这样若被踢后又被「未经审核」拉回，仍会重新接受小群检测。
export async function markApprovedGuild(ctx: Context, guildId: string) {
    await ctx.database.upsert('approved_guild', [{
        platform: BLACKLIST_PLATFORM,
        guildId,
        timestamp: Math.floor(Date.now() / 1000),
    }]);
}

export async function isApprovedGuild(ctx: Context, guildId: string): Promise<boolean> {
    const records = await ctx.database.get('approved_guild', { platform: BLACKLIST_PLATFORM, guildId });
    return records.length > 0;
}

export async function clearApprovedGuild(ctx: Context, guildId: string) {
    await ctx.database.remove('approved_guild', { platform: BLACKLIST_PLATFORM, guildId });
}

// 待处理邀请管理
export async function getPendingInvite(ctx: Context, groupId: string) {
    const records = await ctx.database.get('pending_invite', { platform: BLACKLIST_PLATFORM, groupId });
    return records.length > 0 ? records[0] : null;
}

export async function addPendingInvite(ctx: Context, inviteUser: Omit<PendingInvite, 'platform'>) {
    await ctx.database.upsert('pending_invite', [{ platform: BLACKLIST_PLATFORM, ...inviteUser }]);
}

export async function removePendingInvite(ctx: Context, groupId: string) {
    await ctx.database.remove('pending_invite', { platform: BLACKLIST_PLATFORM, groupId });
}

export async function getAllPendingInvites(ctx: Context) {
    return await ctx.database.get('pending_invite', { platform: BLACKLIST_PLATFORM });
}

export async function clearExpiredPendingInvites(ctx: Context, expireTimeMs: number) {
    const cutoff = Math.floor((Date.now() - expireTimeMs) / 1000);
    // 单次条件批量删除，避免全表拉取 + 逐行删除（N+1）
    await ctx.database.remove('pending_invite', { platform: BLACKLIST_PLATFORM, time: { $lt: cutoff } });
}

// 待处理好友申请管理
export async function getPendingFriendRequest(ctx: Context, platform: string, userId: string) {
    const records = await ctx.database.get('pending_friend_request', { platform, userId });
    return records.length > 0 ? records[0] : null;
}

export async function addPendingFriendRequest(ctx: Context, platform: string, data: Omit<PendingFriendRequest, 'platform'>) {
    await ctx.database.upsert('pending_friend_request', [{ platform, ...data }]);
}

export async function removePendingFriendRequest(ctx: Context, platform: string, userId: string) {
    await ctx.database.remove('pending_friend_request', { platform, userId });
}

export async function getAllPendingFriendRequests(ctx: Context, platform: string) {
    return await ctx.database.get('pending_friend_request', { platform });
}

export async function clearExpiredPendingFriendRequests(ctx: Context, platform: string, expireTimeMs: number) {
    const cutoff = Math.floor((Date.now() - expireTimeMs) / 1000);
    // 单次条件批量删除，避免全表拉取 + 逐行删除（N+1）
    await ctx.database.remove('pending_friend_request', { platform, time: { $lt: cutoff } });
}
