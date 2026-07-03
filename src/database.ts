import { Context, Tables } from 'koishi'
import { parseGuildId } from './utils-id'
import { SimpleLRUCache } from './utils'

export interface BlacklistedGuild {
    platform: string
    guildId: string
    timestamp: number
    reason: string
}

export interface BlacklistedFriend {
    platform: string
    userId: string
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
    selfId: string
    timestamp: number
}

export interface SelfLeftGuild {
    platform: string
    guildId: string
    selfId: string
    timestamp: number
}

export interface PendingInvite {
    platform: string
    groupId: string
    selfId: string
    userId: string
    userName: string
    groupName: string
    time: number
    flag: string
}

export interface PendingFriendRequest {
    platform: string
    selfId: string
    userId: string
    nickname: string
    comment: string
    flag: string
    time: number
}

declare module 'koishi' {
    interface Tables {
        blacklisted_guild: BlacklistedGuild
        blacklisted_friend: BlacklistedFriend
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

    ctx.model.extend('blacklisted_friend', {
        platform: 'string',
        userId: 'string',
        timestamp: 'integer',
        reason: 'string',
    }, { primary: ['platform', 'userId'] })

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
        selfId: 'string',
        timestamp: 'integer',
    }, { primary: ['platform', 'guildId'] })

    ctx.model.extend('approved_guild', {
        platform: 'string',
        guildId: 'string',
        selfId: 'string',
        timestamp: 'integer',
    }, { primary: ['platform', 'guildId'] })

    ctx.model.extend('pending_invite', {
        platform: 'string',
        groupId: 'string',
        selfId: 'string',
        userId: 'string',
        userName: 'string',
        groupName: 'string',
        time: 'integer',
        flag: 'string',
    }, { primary: ['platform', 'groupId'] })

    ctx.model.extend('pending_friend_request', {
        platform: 'string',
        selfId: 'string',
        userId: 'string',
        nickname: 'string',
        comment: 'string',
        flag: 'string',
        time: 'integer',
    }, { primary: ['platform', 'userId'] })
}

export const BLACKLIST_PLATFORM = 'onebot';

function normalizeId(id: string): string {
    return parseGuildId(id) ?? id;
}

function scopedId(id: string, selfId: string): string {
    return `${normalizeId(selfId)}#${normalizeId(id)}`;
}

function unscopedId(id: string): string {
    const match = id.match(/^\d+#(.+)$/);
    return match ? normalizeId(match[1]) : normalizeId(id);
}

function isScopedId(id: string): boolean {
    return /^\d+#.+$/.test(id);
}

function decodePendingInvite(row: PendingInvite): PendingInvite {
    return { ...row, groupId: unscopedId(row.groupId), userId: unscopedId(row.userId) };
}

function decodePendingFriendRequest(row: PendingFriendRequest): PendingFriendRequest {
    return { ...row, userId: unscopedId(row.userId) };
}

/**
 * 旧数据迁移辅助：早期版本未做 ID 规范化，库里可能存了形如 `onebot:12345` 之类带前缀的字段。
 * 本函数把目标表 platform 维度内所有行拉出来，按归一化后的 id 比对，捞回这些「兼容性脏数据」。
 * 调用方一般在查不到精确匹配时再回退到这里，避免每次查询都走全表。
 */
async function getRowsByNormalizedId<K extends keyof Tables>(
    ctx: Context,
    table: K,
    field: keyof Tables[K] & string,
    platform: string,
    id: string,
): Promise<Tables[K][]> {
    const normalized = normalizeId(id);
    // koishi 的 database.get 重载无法对「泛型」表名 K 做查询类型推断（具体表名才行），
    // 且 Query<Tables[K]> 含主键字符串简写分支，与对象查询不重叠。
    // 查询条件 { platform } 对本插件所有表都合法，故此处做一次受控的 any 断言。
    const rows = await ctx.database.get(table, { platform } as any);
    return rows.filter((row) => normalizeId(String((row as Record<string, unknown>)[field] ?? '')) === normalized);
}

/**
 * 三级回退查找单行（仅用于带 selfId 维度的表，如 self_left_guild / approved_guild /
 * pending_invite / pending_friend_request）。依次尝试：
 *   1. scoped 形 id（`selfId#id`）—— 当前版本写入格式
 *   2. legacy unscoped id（裸 id）        —— 旧版本未区分 bot 的写入格式
 *   3. prefixed-legacy（如 `onebot:12345`）── 更早的未规范化格式，靠 getRowsByNormalizedId 捞回
 *
 * 命中后一并返回「删除该行应使用的字段值」，避免调用方再二次定位。
 * 命中上一级即不触发下一级的查询，沿用旧实现的短路语义。
 *
 * field 为目标 id 列名（如 'guildId' / 'userId' / 'groupId'）。
 */
type ScopedRowResult = {
    /** 命中的原始行 ID 字段（已存于库中的形态，删除时按它构造条件） */
    storedId: string
    /** 命中的行；facade 仅读取此对象的 id 字段，故可用宽松类型 */
    row: Record<string, unknown>
} | null;

async function findScopedRow(
    ctx: Context,
    table: keyof Tables,
    field: string,
    platform: string,
    id: string,
    selfId: string,
): Promise<ScopedRowResult> {
    const selfKey = normalizeId(selfId);
    const normId = normalizeId(id);
    // scoped：当前写入格式
    {
        const scopedIdStr = scopedId(id, selfKey);
        const [row] = await ctx.database.get(
            table,
            { platform, [field]: scopedIdStr } as any,
        );
        if (row) return { storedId: scopedIdStr, row: row as Record<string, unknown> };
    }
    // legacy unscoped：旧版本（未区分 bot）格式
    {
        const [row] = await ctx.database.get(
            table,
            { platform, [field]: normId } as any,
        );
        if (row) return { storedId: normId, row: row as Record<string, unknown> };
    }
    // prefixed-legacy：更早的未规范化格式（如 onebot:12345），靠全表归一化比对捞回
    const prefixed = await getRowsByNormalizedId(ctx, table, field as never, platform, id);
    const hit = prefixed.find(r => !isScopedId(String((r as Record<string, unknown>)[field] ?? '')));
    if (hit) return { storedId: String((hit as Record<string, unknown>)[field] ?? ''), row: hit as Record<string, unknown> };
    return null;
}

/**
 * 删除单个 scoped 行（带 selfId 维度的表）。覆盖三级回退形态：
 *   - scoped（selfId#id）
 *   - legacy unscoped（裸 id）
 *   - prefixed-legacy（未规范化格式，逐行删，仅删非 scoped 的脏数据）
 *
 * 不传 selfId（用于 unban 等无 bot 上下文场景）时，改为全表拉取后按归一化 id 比对删除——
 * 因为此时 scoped 前缀未知，无法直查，只能扫描。
 */
async function clearScopedRows(
    ctx: Context,
    table: keyof Tables,
    field: string,
    platform: string,
    guildId: string,
    selfId?: string,
): Promise<void> {
    const normalizedId = normalizeId(guildId);
    if (selfId) {
        const selfKey = normalizeId(selfId);
        // scoped
        await ctx.database.remove(table, { platform, [field]: scopedId(guildId, selfKey) } as any);
        // legacy unscoped
        await ctx.database.remove(table, { platform, [field]: normalizedId } as any);
        // prefixed-legacy：仅删非 scoped 的脏数据（scoped 行已是当前格式，不动）
        const dirty = await getRowsByNormalizedId(ctx, table, field as never, platform, guildId);
        for (const row of dirty) {
            const stored = String((row as Record<string, unknown>)[field] ?? '');
            if (!isScopedId(stored)) {
                await ctx.database.remove(table, { platform, [field]: stored } as any);
            }
        }
        return;
    }
    // 无 selfId：全表扫描按归一化 id 比对删除
    const rows = await ctx.database.get(table, { platform } as any);
    for (const row of rows) {
        const stored = String((row as Record<string, unknown>)[field] ?? '');
        if (unscopedId(stored) === normalizedId) {
            await ctx.database.remove(table, { platform, [field]: stored } as any);
        }
    }
}

export async function getBlacklistedGuild(ctx: Context, guildId: string) {
    guildId = normalizeId(guildId);
    const rows = await ctx.database.get('blacklisted_guild', { platform: BLACKLIST_PLATFORM, guildId });
    return rows.length > 0 ? rows : await getRowsByNormalizedId(ctx, 'blacklisted_guild', 'guildId', BLACKLIST_PLATFORM, guildId);
}

export async function removeBlacklistedGuild(ctx: Context, guildId: string) {
    guildId = normalizeId(guildId);
    const rows = await getRowsByNormalizedId(ctx, 'blacklisted_guild', 'guildId', BLACKLIST_PLATFORM, guildId);
    await ctx.database.remove('blacklisted_guild', { platform: BLACKLIST_PLATFORM, guildId });
    for (const row of rows) {
        if (row.guildId !== guildId) {
            await ctx.database.remove('blacklisted_guild', { platform: BLACKLIST_PLATFORM, guildId: row.guildId });
        }
    }
    return rows.length > 0;
}

export async function createBlacklistedGuild(ctx: Context, guildId: string, reason: string) {
    guildId = normalizeId(guildId);
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

// ── 好友黑名单（与群黑名单对称，用于 gc.ban 好友、自动拒绝其后续申请）──

export async function getBlacklistedFriend(ctx: Context, userId: string): Promise<boolean> {
    userId = normalizeId(userId);
    const rows = await ctx.database.get('blacklisted_friend', { platform: BLACKLIST_PLATFORM, userId });
    if (rows.length > 0) return true;
    return (await getRowsByNormalizedId(ctx, 'blacklisted_friend', 'userId', BLACKLIST_PLATFORM, userId)).length > 0;
}

export async function createBlacklistedFriend(ctx: Context, userId: string, reason: string) {
    userId = normalizeId(userId);
    return await ctx.database.upsert('blacklisted_friend', [{
        platform: BLACKLIST_PLATFORM,
        userId,
        timestamp: Math.floor(Date.now() / 1000),
        reason,
    }]);
}

export async function removeBlacklistedFriend(ctx: Context, userId: string) {
    userId = normalizeId(userId);
    const rows = await getRowsByNormalizedId(ctx, 'blacklisted_friend', 'userId', BLACKLIST_PLATFORM, userId);
    await ctx.database.remove('blacklisted_friend', { platform: BLACKLIST_PLATFORM, userId });
    for (const row of rows) {
        if (row.userId !== userId) {
            await ctx.database.remove('blacklisted_friend', { platform: BLACKLIST_PLATFORM, userId: row.userId });
        }
    }
    return rows.length > 0;
}

export async function getAllBlacklistedFriends(ctx: Context) {
    return await ctx.database.get('blacklisted_friend', { platform: BLACKLIST_PLATFORM });
}

/** 统一写入被踢黑名单行，保证 platform = BLACKLIST_PLATFORM */
export async function blacklistKicked(ctx: Context, guildId: string) {
    guildId = normalizeId(guildId);
    return await ctx.database.upsert('blacklisted_guild', [{
        platform: BLACKLIST_PLATFORM,
        guildId,
        timestamp: Math.floor(Date.now() / 1000),
        reason: 'kicked',
    }]);
}

// ── 持久化「主动退群」标记，用于 guild-removed 区分主动退 vs 被踢 ──

/** 在主动退群前写入标记，让 guild-removed 能区分「自己退的」和「被踢的」*/
export async function markSelfLeft(ctx: Context, guildId: string, selfId: string) {
    selfId = normalizeId(selfId);
    guildId = scopedId(guildId, selfId);
    await ctx.database.upsert('self_left_guild', [{
        platform: BLACKLIST_PLATFORM,
        guildId,
        selfId,
        timestamp: Math.floor(Date.now() / 1000),
    }]);
}

/** 消费标记（单次读取后即删除），返回是否在 maxAgeSec 内。用于 guild-removed 判断是自己退的 */
export async function consumeSelfLeft(ctx: Context, guildId: string, selfId: string, maxAgeSec = 120): Promise<boolean> {
    selfId = normalizeId(selfId);
    const hit = await findScopedRow(ctx, 'self_left_guild', 'guildId', BLACKLIST_PLATFORM, guildId, selfId);
    if (!hit) return false;
    // 无论超不超时都清理，防止堆积
    await ctx.database.remove('self_left_guild', { platform: BLACKLIST_PLATFORM, guildId: hit.storedId });
    const row = hit.row as unknown as SelfLeftGuild;
    return (Math.floor(Date.now() / 1000) - row.timestamp) <= maxAgeSec;
}

/** 清理标记（退群失败时回滚，或 unban 时清理） */
export async function clearSelfLeft(ctx: Context, guildId: string, selfId?: string) {
    await clearScopedRows(ctx, 'self_left_guild', 'guildId', BLACKLIST_PLATFORM, guildId, selfId);
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

const groupBotStatusCache = new SimpleLRUCache<GroupBotStatus | null>(GROUP_BOT_STATUS_CACHE_TTL, GROUP_BOT_STATUS_CACHE_MAX);
const groupBotStatusCacheKey = (platform: string, guildId: string) => `${platform}:${guildId}`;

function getCachedGroupBotStatus(key: string): GroupBotStatus | null | undefined {
    return groupBotStatusCache.get(key);
}

function setCachedGroupBotStatus(key: string, value: GroupBotStatus | null) {
    groupBotStatusCache.set(key, value);
}

export async function getGroupBotStatus(ctx: Context, platform: string, guildId: string): Promise<GroupBotStatus | null> {
    guildId = normalizeId(guildId);
    const key = groupBotStatusCacheKey(platform, guildId);
    const cached = getCachedGroupBotStatus(key);
    if (cached !== undefined) return cached;
    const records = await ctx.database.get('group_bot_status', { platform, guildId });
    const legacyRecords = records.length > 0 ? [] : await getRowsByNormalizedId(ctx, 'group_bot_status', 'guildId', platform, guildId);
    const status = records.length > 0 ? records[0] : (legacyRecords.length > 0 ? {
        ...legacyRecords[0],
        guildId,
    } as GroupBotStatus : null);
    setCachedGroupBotStatus(key, status);
    return status;
}

export async function setGroupBotStatus(ctx: Context, platform: string, guildId: string, botEnabled: boolean) {
    guildId = normalizeId(guildId);
    await ctx.database.upsert('group_bot_status', [{ platform, guildId, botEnabled }]);
    setCachedGroupBotStatus(groupBotStatusCacheKey(platform, guildId), { platform, guildId, botEnabled });
}

// 小群白名单管理
export async function isInSmallGroupWhitelist(ctx: Context, guildId: string): Promise<boolean> {
    guildId = normalizeId(guildId);
    const records = await ctx.database.get('small_group_whitelist', { platform: BLACKLIST_PLATFORM, guildId });
    return records.length > 0;
}

export async function addToSmallGroupWhitelist(ctx: Context, guildId: string) {
    guildId = normalizeId(guildId);
    await ctx.database.upsert('small_group_whitelist', [{ platform: BLACKLIST_PLATFORM, guildId }]);
}

export async function removeFromSmallGroupWhitelist(ctx: Context, guildId: string) {
    guildId = normalizeId(guildId);
    await ctx.database.remove('small_group_whitelist', { platform: BLACKLIST_PLATFORM, guildId });
}

export async function getAllSmallGroupWhitelist(ctx: Context) {
    return await ctx.database.get('small_group_whitelist', { platform: BLACKLIST_PLATFORM });
}

// 已审核/已自动通过的群（持久化）。
// 用于让审核放行的群永久豁免小群检测（含实时监控）；机器人退群时清除，
// 这样若被踢后又被「未经审核」拉回，仍会重新接受小群检测。
export async function markApprovedGuild(ctx: Context, guildId: string, selfId: string) {
    selfId = normalizeId(selfId);
    guildId = scopedId(guildId, selfId);
    await ctx.database.upsert('approved_guild', [{
        platform: BLACKLIST_PLATFORM,
        guildId,
        selfId,
        timestamp: Math.floor(Date.now() / 1000),
    }]);
}

export async function isApprovedGuild(ctx: Context, guildId: string, selfId: string): Promise<boolean> {
    selfId = normalizeId(selfId);
    return (await findScopedRow(ctx, 'approved_guild', 'guildId', BLACKLIST_PLATFORM, guildId, selfId)) !== null;
}

export async function clearApprovedGuild(ctx: Context, guildId: string, selfId?: string) {
    await clearScopedRows(ctx, 'approved_guild', 'guildId', BLACKLIST_PLATFORM, guildId, selfId);
}

// 待处理邀请管理
export async function getPendingInvite(ctx: Context, platform: string, groupId: string, selfId: string) {
    selfId = normalizeId(selfId);
    const hit = await findScopedRow(ctx, 'pending_invite', 'groupId', platform, groupId, selfId);
    return hit ? decodePendingInvite(hit.row as unknown as PendingInvite) : null;
}

export async function addPendingInvite(ctx: Context, platform: string, selfId: string, inviteUser: Omit<PendingInvite, 'platform' | 'selfId'>) {
    selfId = normalizeId(selfId);
    await ctx.database.upsert('pending_invite', [{
        platform,
        selfId,
        ...inviteUser,
        groupId: scopedId(inviteUser.groupId, selfId),
        userId: normalizeId(inviteUser.userId),
    }]);
}

export async function removePendingInvite(ctx: Context, platform: string, groupId: string, selfId: string) {
    selfId = normalizeId(selfId);
    await clearScopedRows(ctx, 'pending_invite', 'groupId', platform, groupId, selfId);
}

export async function getAllPendingInvites(ctx: Context, platform: string, selfId: string) {
    selfId = normalizeId(selfId);
    const rows = await ctx.database.get('pending_invite', { platform });
    return rows
        .filter(row => row.selfId ? normalizeId(row.selfId) === selfId : !isScopedId(row.groupId))
        .map(decodePendingInvite);
}

export async function clearExpiredPendingInvites(ctx: Context, platform: string, expireTimeMs: number) {
    const cutoff = Math.floor((Date.now() - expireTimeMs) / 1000);
    // 单次条件批量删除，避免全表拉取 + 逐行删除（N+1）
    await ctx.database.remove('pending_invite', { platform, time: { $lt: cutoff } });
}

// 待处理好友申请管理
export async function getPendingFriendRequest(ctx: Context, platform: string, selfId: string, userId: string) {
    selfId = normalizeId(selfId);
    const hit = await findScopedRow(ctx, 'pending_friend_request', 'userId', platform, userId, selfId);
    return hit ? decodePendingFriendRequest(hit.row as unknown as PendingFriendRequest) : null;
}

export async function addPendingFriendRequest(ctx: Context, platform: string, selfId: string, data: Omit<PendingFriendRequest, 'platform' | 'selfId'>) {
    selfId = normalizeId(selfId);
    await ctx.database.upsert('pending_friend_request', [{
        platform,
        selfId,
        ...data,
        userId: scopedId(data.userId, selfId),
    }]);
}

export async function removePendingFriendRequest(ctx: Context, platform: string, selfId: string, userId: string) {
    selfId = normalizeId(selfId);
    await clearScopedRows(ctx, 'pending_friend_request', 'userId', platform, userId, selfId);
}

export async function getAllPendingFriendRequests(ctx: Context, platform: string, selfId: string) {
    selfId = normalizeId(selfId);
    const rows = await ctx.database.get('pending_friend_request', { platform });
    return rows
        .filter(row => row.selfId ? normalizeId(row.selfId) === selfId : !isScopedId(row.userId))
        .map(decodePendingFriendRequest);
}

export async function clearExpiredPendingFriendRequests(ctx: Context, platform: string, selfId: string, expireTimeMs: number) {
    const cutoff = Math.floor((Date.now() - expireTimeMs) / 1000);
    // 单次条件批量删除，避免全表拉取 + 逐行删除（N+1）
    await ctx.database.remove('pending_friend_request', { platform, time: { $lt: cutoff } });
}
