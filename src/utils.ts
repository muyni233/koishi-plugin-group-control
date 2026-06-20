import { Bot, Context, Session } from 'koishi'
import { Config } from './config'
import { asOneBotBot, OneBotBot, OneBotMember } from './types'
import { parseGuildId, toOneBotNumber } from './utils-id'
import { createLogger } from './logger'

// 重新导出，保持现有 import 路径不破坏
export { parseGuildId, toOneBotNumber, formatDate } from './utils-id'

export function isBlacklistEnabled(config: Config['basic']): string | null {
    if (!config.enableBlacklist) return '黑名单功能未启用。'
    return null
}

export function getAdminCommandOptions(config: Config): Record<string, unknown> {
    return config.permission.mode === 'koishi'
        ? { authority: config.permission.koishiAuthority }
        : {}
}

/** 通知管理员：优先发到通知群，否则私聊每个 adminQQ。失败仅记录日志，不抛异常。 */
export async function notifyAdmins(ctx: Context, bot: Bot, config: Config, message: string): Promise<void> {
    const logger = createLogger(ctx, 'group-control:notify')
    if (config.admin.notificationGroupId) {
        try {
            await bot.sendMessage(config.admin.notificationGroupId, message)
            return
        } catch (err) {
            logger.warn(`发送通知到通知群 ${config.admin.notificationGroupId} 失败`, err)
        }
    }
    if (config.admin.adminQQs?.length > 0) {
        for (const adminQQ of config.admin.adminQQs) {
            try {
                await bot.sendPrivateMessage(adminQQ, message)
            } catch (err) {
                logger.warn(`发送通知给管理员 ${adminQQ} 失败`, err)
            }
        }
    }
}

/** 是否为全局管理员（填在 adminQQs 里的） */
export function isGlobalAdmin(session: Session, config: Config): boolean {
    if (config.permission.mode === 'koishi') {
        const user = session.user as { authority?: number } | undefined
        return typeof user?.authority === 'number' && user.authority >= config.permission.koishiAuthority
    }
    if (!session.userId) return false
    return config.admin.adminQQs?.includes(session.userId) ?? false
}

const GUILD_ADMIN_CACHE_TTL = 30 * 1000
const GUILD_ADMIN_NEGATIVE_CACHE_TTL = 5 * 1000
const GUILD_ADMIN_CACHE_MAX = 1000

interface LRUCacheEntry<T> {
    value: T
    expiresAt: number
}

export class SimpleLRUCache<T> {
    private entries = new Map<string, LRUCacheEntry<T>>()

    constructor(private readonly ttlMs: number, private readonly maxSize = 1000) { }

    get(key: string): T | undefined {
        const entry = this.entries.get(key)
        if (!entry) return undefined
        if (entry.expiresAt <= Date.now()) {
            this.entries.delete(key)
            return undefined
        }
        this.entries.delete(key)
        this.entries.set(key, entry)
        return entry.value
    }

    set(key: string, value: T, ttlMs = this.ttlMs): void {
        this.entries.set(key, { value, expiresAt: Date.now() + ttlMs })
        this.prune()
    }

    delete(key: string): void {
        this.entries.delete(key)
    }

    clear(): void {
        this.entries.clear()
    }

    prune(now = Date.now()): void {
        for (const [key, entry] of this.entries) {
            if (entry.expiresAt <= now) this.entries.delete(key)
        }
        while (this.entries.size > this.maxSize) {
            const oldestKey = this.entries.keys().next().value
            if (!oldestKey) break
            this.entries.delete(oldestKey)
        }
    }
}

const guildAdminCache = new SimpleLRUCache<boolean>(GUILD_ADMIN_CACHE_TTL, GUILD_ADMIN_CACHE_MAX)

function guildAdminCacheKey(session: Session): string | null {
    if (!session.guildId || !session.userId) return null
    return `${session.platform}:${session.guildId}:${session.userId}`
}

function getCachedGuildAdmin(session: Session): boolean | undefined {
    const key = guildAdminCacheKey(session)
    if (!key) return undefined
    return guildAdminCache.get(key)
}

function setCachedGuildAdmin(session: Session, value: boolean): void {
    const key = guildAdminCacheKey(session)
    if (!key) return
    const ttl = value ? GUILD_ADMIN_CACHE_TTL : GUILD_ADMIN_NEGATIVE_CACHE_TTL
    guildAdminCache.set(key, value, ttl)
}

export function clearGuildAdminCache(): void {
    guildAdminCache.clear()
}

function hasAdminRole(member: OneBotMember | null | undefined): boolean {
    if (!member) return false

    // 兼容多种字段名：member.role / member.sender.role / member.data.role / member.member.role
    const data = ((member as { data?: OneBotMember }).data
        ?? (member as { member?: OneBotMember }).member
        ?? (member as { sender?: OneBotMember }).sender
        ?? member) as OneBotMember
    const role = data.role ?? data.memberRole ?? data.permissions
    if (role === 'admin' || role === 'owner' || role === 'administrator') return true

    const roles = data.roles ?? data.roleIds
    if (Array.isArray(roles)) {
        return roles.some((roleName: string) => roleName === 'admin' || roleName === 'owner' || roleName === 'administrator')
    }

    return false
}

async function getOneBotGroupMemberInfo(session: Session): Promise<OneBotMember | null> {
    const guildId = toOneBotNumber(session.guildId)
    const userId = toOneBotNumber(session.userId)
    if (guildId == null || userId == null) return null
    try {
        return await asOneBotBot(session.bot).internal?.getGroupMemberInfo?.(guildId, userId, true) ?? null
    } catch {
        return null
    }
}

/** 是否为群管理员或群主（仅 builtin 模式使用） */
async function isGuildAdmin(session: Session): Promise<boolean> {
    const event = session.event as { member?: OneBotMember } | undefined
    const rawEvent = (session.event as { _data?: { sender?: OneBotMember } } | undefined)?._data
    if (hasAdminRole(event?.member) || hasAdminRole(rawEvent?.sender)) {
        setCachedGuildAdmin(session, true)
        return true
    }

    const cached = getCachedGuildAdmin(session)
    if (cached !== undefined) return cached

    let result = false

    if (session.guildId && session.userId) {
        try {
            const member = await session.bot.getGuildMember(session.guildId, session.userId)
            if (hasAdminRole(member as OneBotMember)) result = true
        } catch { /* 忽略：可能没有权限或 API 不支持 */ }
    }

    if (!result) {
        const info = await getOneBotGroupMemberInfo(session)
        if (hasAdminRole(info)) result = true
    }

    setCachedGuildAdmin(session, result)
    return result
}

/**
 * 检查群级权限（bot-on/off、quit、protectedCommands）
 * builtin 模式：群管理员或全局管理员均可
 * koishi 模式：由 authority 决定
 */
export async function hasGuildPermission(session: Session, config: Config): Promise<boolean> {
    if (config.permission.mode === 'koishi') {
        const user = session.user as { authority?: number } | undefined
        return typeof user?.authority === 'number' && user.authority >= config.permission.koishiAuthority
    }
    if (isGlobalAdmin(session, config)) return true
    return await isGuildAdmin(session)
}

/**
 * 检查全局管理权限（gc.ban/gc.approve/gc.fa 等）
 * builtin 模式：仅全局管理员（adminQQs）；koishi 模式：由 authority 决定
 */
export function hasGlobalPermission(session: Session, config: Config): boolean {
    return isGlobalAdmin(session, config)
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
    'gc.debug',
])

// 兼容旧 import：让上层模块仍可写 `import { OneBotBot } from './utils'` 等。
export type { OneBotBot } from './types'
