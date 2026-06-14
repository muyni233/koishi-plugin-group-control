import { Context, Session } from 'koishi'
import { Config } from './config'

export function isBlacklistEnabled(config: Config['basic']): string | null {
    if (!config.enableBlacklist) return '黑名单功能未启用。';
    return null;
}

export function parseGuildId(input: string | undefined | null): string | null {
    if (!input) return null;  // 防止无参调用指令时 input 为 undefined 导致 .trim() 崩溃
    const match = input.trim().match(/^(?:[^:]+:)?(\d+)$/);
    return match ? match[1] : null;
}

export function toOneBotNumber(input: string | undefined | null): number | null {
    const id = parseGuildId(input);
    if (!id) return null;
    const value = Number(id);
    return Number.isSafeInteger(value) ? value : null;
}

export function getAdminCommandOptions(config: Config): Record<string, any> {
    return config.permission.mode === 'koishi'
        ? { authority: config.permission.koishiAuthority }
        : {};
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

interface LRUCacheEntry<T> {
    value: T
    expiresAt: number
}

export class SimpleLRUCache<T> {
    private entries = new Map<string, LRUCacheEntry<T>>();

    constructor(private readonly ttlMs: number, private readonly maxSize = 1000) { }

    get(key: string): T | undefined {
        const entry = this.entries.get(key);
        if (!entry) return undefined;
        if (entry.expiresAt <= Date.now()) {
            this.entries.delete(key);
            return undefined;
        }
        this.entries.delete(key);
        this.entries.set(key, entry);
        return entry.value;
    }

    set(key: string, value: T, ttlMs = this.ttlMs) {
        this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
        this.prune();
    }

    delete(key: string) {
        this.entries.delete(key);
    }

    clear() {
        this.entries.clear();
    }

    prune(now = Date.now()) {
        for (const [key, entry] of this.entries) {
            if (entry.expiresAt <= now) this.entries.delete(key);
        }
        while (this.entries.size > this.maxSize) {
            const oldestKey = this.entries.keys().next().value;
            if (!oldestKey) break;
            this.entries.delete(oldestKey);
        }
    }
}

const guildAdminCache = new SimpleLRUCache<boolean>(GUILD_ADMIN_CACHE_TTL, GUILD_ADMIN_CACHE_MAX);

function guildAdminCacheKey(session: Session): string | null {
    if (!session.guildId || !session.userId) return null;
    return `${session.platform}:${session.guildId}:${session.userId}`;
}

function getCachedGuildAdmin(session: Session): boolean | undefined {
    const key = guildAdminCacheKey(session);
    if (!key) return undefined;
    return guildAdminCache.get(key);
}

function setCachedGuildAdmin(session: Session, value: boolean) {
    const key = guildAdminCacheKey(session);
    if (!key) return;
    const ttl = value ? GUILD_ADMIN_CACHE_TTL : GUILD_ADMIN_NEGATIVE_CACHE_TTL;
    guildAdminCache.set(key, value, ttl);
}

export function clearGuildAdminCache() {
    guildAdminCache.clear();
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
    'gc.friend-pending', 'gc.friend-approve', 'gc.friend-reject',
    'gc.fp', 'gc.fa', 'gc.fr',
]);
