import { Context, Session } from 'koishi'
import { Config } from './config'

export function isBlacklistEnabled(config: Config['basic']): string | null {
    if (!config.enableBlacklist) return '黑名单功能未启用。';
    return null;
}

export function parseGuildId(input: string | undefined | null): string | null {
    if (!input) return null;  // 防止无参调用指令时 input 为 undefined 导致 .trim() 崩溃
    const match = input.trim().match(/^onebot:(\d+)$/);
    return match ? match[1] : (/^\d+$/.test(input.trim()) ? input.trim() : null);
}

export function formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString();
}

export async function notifyAdmins(bot: any, config: Config, message: string) {
    if (config.admin.notificationGroupId) {
        try {
            await bot.sendMessage(config.admin.notificationGroupId, message);
            return;
        } catch (error) {
            console.error(`发送通知到通知群 ${config.admin.notificationGroupId} 失败:`, error);
        }
    }
    if (config.admin.adminQQs?.length > 0) {
        for (const adminQQ of config.admin.adminQQs) {
            try {
                await bot.sendPrivateMessage(adminQQ, message);
            } catch (error) {
                console.error(`发送通知给管理员 ${adminQQ} 失败:`, error);
            }
        }
    }
}

/** 是否为全局管理员（填在 adminQQs 里的） */
export function isGlobalAdmin(session: Session, config: Config): boolean {
    if (config.permission.mode === 'koishi') {
        const user = session.user as any;
        return typeof user?.authority === 'number' && user.authority >= config.permission.koishiAuthority;
    }
    return config.admin.adminQQs?.includes(session.userId) ?? false;
}

const GUILD_ADMIN_CACHE_TTL = 30 * 1000;
const GUILD_ADMIN_NEGATIVE_CACHE_TTL = 5 * 1000;
const GUILD_ADMIN_CACHE_MAX = 1000;

interface GuildAdminCacheEntry {
    value: boolean
    expiresAt: number
}

const guildAdminCache = new Map<string, GuildAdminCacheEntry>();

function guildAdminCacheKey(session: Session): string | null {
    if (!session.guildId || !session.userId) return null;
    return `${session.platform}:${session.guildId}:${session.userId}`;
}

function pruneGuildAdminCache(now = Date.now()) {
    for (const [key, entry] of guildAdminCache) {
        if (entry.expiresAt <= now) guildAdminCache.delete(key);
    }
    while (guildAdminCache.size > GUILD_ADMIN_CACHE_MAX) {
        const oldestKey = guildAdminCache.keys().next().value;
        if (!oldestKey) break;
        guildAdminCache.delete(oldestKey);
    }
}

function getCachedGuildAdmin(session: Session): boolean | undefined {
    const key = guildAdminCacheKey(session);
    if (!key) return undefined;
    const entry = guildAdminCache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
        guildAdminCache.delete(key);
        return undefined;
    }
    guildAdminCache.delete(key);
    guildAdminCache.set(key, entry);
    return entry.value;
}

function setCachedGuildAdmin(session: Session, value: boolean) {
    const key = guildAdminCacheKey(session);
    if (!key) return;
    const ttl = value ? GUILD_ADMIN_CACHE_TTL : GUILD_ADMIN_NEGATIVE_CACHE_TTL;
    guildAdminCache.set(key, { value, expiresAt: Date.now() + ttl });
    pruneGuildAdminCache();
}

function hasAdminRole(member: any): boolean {
    if (!member) return false;

    const data = member.data ?? member.member ?? member.sender ?? member;
    const role = data.role ?? data.memberRole ?? data.permissions;
    if (role === 'admin' || role === 'owner' || role === 'administrator') return true;

    const roles = data.roles ?? data.roleIds;
    if (Array.isArray(roles)) {
        return roles.some((role: string) => role === 'admin' || role === 'owner' || role === 'administrator');
    }

    return false;
}

async function getOneBotGroupMemberInfo(session: Session) {
    const guildId = Number(parseGuildId(session.guildId) ?? session.guildId);
    const userId = Number(parseGuildId(session.userId) ?? session.userId);
    if (!Number.isFinite(guildId) || !Number.isFinite(userId)) return null;
    return await (session.bot as any).internal?.getGroupMemberInfo?.(guildId, userId, true);
}

/** 是否为群管理员或群主（仅 builtin 模式使用） */
async function isGuildAdmin(session: Session): Promise<boolean> {
    const event = session.event as any;
    const raw = event?._data ?? (session as any).original ?? (session as any).onebot;
    if (hasAdminRole(event?.member) || hasAdminRole(raw?.sender)) {
        setCachedGuildAdmin(session, true);
        return true;
    }

    const cached = getCachedGuildAdmin(session);
    if (cached !== undefined) return cached;

    let result = false;

    try {
        const member = await session.bot.getGuildMember(session.guildId, session.userId);
        if (hasAdminRole(member)) result = true;
    } catch { }

    if (!result) {
        try {
            const info = await getOneBotGroupMemberInfo(session);
            if (hasAdminRole(info)) result = true;
        } catch { }
    }

    setCachedGuildAdmin(session, result);
    return result;
}

/**
 * 检查群级权限（bot-on/off、quit、protectedCommands）
 * builtin 模式：群管理员或全局管理员均可
 * koishi 模式：由 authority 决定
 */
export async function hasGuildPermission(session: Session, config: Config): Promise<boolean> {
    if (config.permission.mode === 'koishi') {
        const user = session.user as any;
        return typeof user?.authority === 'number' && user.authority >= config.permission.koishiAuthority;
    }
    if (isGlobalAdmin(session, config)) return true;
    return await isGuildAdmin(session);
}

// 检查全局管理权限（gc.ban/gc.approve/gc.fa 等）
// builtin 模式：仅全局管理员（adminQQs）；koishi 模式：由 authority 决定
export function hasGlobalPermission(session: Session, config: Config): boolean {
    return isGlobalAdmin(session, config);
}

/** 管理指令列表 - 这些指令始终不受 bot-off 影响 */
export const ADMIN_COMMANDS = new Set([
    'bot-on', 'bot-off', 'quit',
    'gc', 'gc.banlist', 'gc.unban', 'gc.ban', 'gc.clearban',
    'gc.approve', 'gc.reject', 'gc.pending',
    'gc.sg-add', 'gc.sg-rm', 'gc.sg-list',
    'gc.friends', 'gc.delfriend', 'gc.groups', 'gc.leave',
    'gc.fp', 'gc.fa', 'gc.fr',
]);
