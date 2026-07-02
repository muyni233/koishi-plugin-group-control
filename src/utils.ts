import { Bot, Command, Context, h, Session } from 'koishi'
import { Config } from './config'
import { asOneBotBot, OneBotMember } from './types'
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

/**
 * 模板插值并转义。把 `{key}` 替换为 fields[key] 的字符串形式，并对插值内容做 h.escape。
 *
 * 必须转义的原因：群名 / 昵称 / 附言等字段来自不可信的外部输入，而 koishi 的 sendMessage
 * 会对字符串做 h.parse——未转义的 `<img>`、`<at>` 等会被解析成消息元素，让外部输入能借
 * 群名/附言在管理员通知或群里发图片、@全体。模板字面量本身（如固定文案）不经过插值，
 * 不受影响。
 */
export function escapeTpl(template: string, fields: Record<string, string | number>): string {
    let out = template
    for (const [key, value] of Object.entries(fields)) {
        const safe = h.escape(String(value))
        out = out.split(`{${key}}`).join(safe)
    }
    return out
}

export type TargetDomain = 'group' | 'friend'

export interface ResolvedTarget {
    domain: TargetDomain
    id: string
}

/**
 * 取当前会话所引用（回复）消息的纯文本。引用消息挂在 session.event.message.quote.content
 * （Koishi h 元素字符串），用 h.parse + toString(true) 把 <at>/<img> 等标签拍平，只留文字，
 * 便于正则提取群号/QQ号。
 */
export function getQuotedText(session: Session): string {
    const content = (session.event as { message?: { quote?: { content?: string } } } | undefined)?.message?.quote?.content
    if (!content || typeof content !== 'string') return ''
    try {
        return h.parse(content).map(el => (typeof el.toString === 'function' ? el.toString(true) : '')).join('')
    } catch {
        return content.replace(/<[^>]+>/g, '')
    }
}

/**
 * 从机器人通知消息的纯文本里解析目标（群或好友）。
 * - 含「好友申请」→ 好友，提取 QQ 号（群邀请通知虽也带 QQ:，但无此关键字，不会误判）。
 * - 否则含「群号」→ 群（覆盖群邀请、黑名单拒绝、小群合格等通知）。
 */
export function parseQuotedTarget(text: string): ResolvedTarget | null {
    if (!text) return null
    if (/好友申请/.test(text)) {
        const m = text.match(/QQ[：:]\s*(\d{5,})/i)
        return m ? { domain: 'friend', id: m[1] } : null
    }
    const m = text.match(/群号[：:]\s*(\d{5,})/)
    return m ? { domain: 'group', id: m[1] } : null
}

/** 带前缀的目标参数解析结果：明确域，或仅一个裸号待调用方自动识别。 */
export type ParsedTargetArg = ResolvedTarget | { bare: string }

/**
 * 解析指令参数：支持 group:/friend:/g:/f:/群:/好友: 前缀强制域；无前缀视为裸号。
 * 返回 null 表示无法识别为号码。
 */
export function parseTargetArg(input: string | undefined | null): ParsedTargetArg | null {
    if (!input) return null
    const g = input.match(/^(?:group|g|群)[:：]?\s*(\d{4,})$/i)
    if (g) return { domain: 'group', id: g[1] }
    const f = input.match(/^(?:friend|f|好友)[:：]?\s*(\d{4,})$/i)
    if (f) return { domain: 'friend', id: f[1] }
    const bare = parseGuildId(input)
    return bare ? { bare } : null
}

/** 通知管理员：优先发到通知群，否则私聊首个（0号）主管理员。 */
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
    const primary = config.admin.primaryAdmins?.[0]
    if (primary) {
        try {
            await bot.sendPrivateMessage(primary, message)
        } catch (err) {
            logger.warn(`发送通知给主管理员 ${primary} 失败`, err)
        }
    }
}

/** 是否为主管理员（填在 primaryAdmins 里的） */
export function isPrimaryAdmin(session: Session, config: Config): boolean {
    if (config.permission.mode === 'koishi') {
        const user = session.user as { authority?: number } | undefined
        return typeof user?.authority === 'number' && user.authority >= config.permission.koishiAuthority
    }
    if (!session.userId) return false
    return config.admin.primaryAdmins?.includes(session.userId) ?? false
}

/** 是否为副管理员（填在 deputyAdmins 里的；koishi 模式不区分主副，恒为 false） */
export function isDeputyAdmin(session: Session, config: Config): boolean {
    if (config.permission.mode === 'koishi') return false
    if (!session.userId) return false
    return config.admin.deputyAdmins?.includes(session.userId) ?? false
}

/** 是否为全局管理员（=主管理员）。builtin 模式认 primaryAdmins；koishi 模式由 authority 决定 */
export function isGlobalAdmin(session: Session, config: Config): boolean {
    return isPrimaryAdmin(session, config)
}

/** 是否为任意管理员（主或副）。gc 系列指令统一用此判定；koishi 模式由 authority 决定 */
export function hasAdminPermission(session: Session, config: Config): boolean {
    if (config.permission.mode === 'koishi') {
        const user = session.user as { authority?: number } | undefined
        return typeof user?.authority === 'number' && user.authority >= config.permission.koishiAuthority
    }
    return isPrimaryAdmin(session, config) || isDeputyAdmin(session, config)
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

/** 判定成员是否为群管理员/群主。兼容两种真实形态：
 *   - 原始 OneBot 成员：role 为 'owner'/'admin'/'member'
 *   - koishi GuildMember：roles 为 [{ id: 'owner'|'admin' }]（decodeGuildMember 产出） */
function hasAdminRole(member: OneBotMember | null | undefined): boolean {
    if (!member) return false
    if (member.role === 'owner' || member.role === 'admin') return true
    if (Array.isArray(member.roles)) {
        return member.roles.some(r => r.id === 'owner' || r.id === 'admin')
    }
    return false
}

async function getOneBotGroupMemberInfo(session: Session): Promise<OneBotMember | null> {
    const guildId = toOneBotNumber(session.guildId)
    const userId = toOneBotNumber(session.userId)
    if (guildId == null || userId == null) return null
    try {
        return await asOneBotBot(session.bot).internal.getGroupMemberInfo(guildId, userId)
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
 * 检查全局管理权限（主管理员）。builtin 模式认 primaryAdmins；koishi 模式由 authority 决定。
 * 注：gc 系列指令现已统一用 hasAdminPermission（主、副均可）；本函数保留给「仅主管理员」语义。
 */
export function hasGlobalPermission(session: Session, config: Config): boolean {
    return isGlobalAdmin(session, config)
}

/** 管理指令列表 - 这些指令始终不受 bot-off / 频率控制影响 */
export const ADMIN_COMMANDS = new Set([
    'bot-on', 'bot-off', 'quit',
    'gc', 'gc.banlist', 'gc.unban', 'gc.ban', 'gc.clearban',
    'gc.approve', 'gc.reject', 'gc.pending',
    'gc.sg-add', 'gc.sg-rm', 'gc.sg-list',
    'gc.friends', 'gc.delfriend', 'gc.groups', 'gc.leave',
    'gc.friend-pending', 'gc.friend-approve', 'gc.friend-reject',
    'gc.fp', 'gc.fa', 'gc.fr',
    'gc.debug', 'gc.debug.member-list', 'gc.debug.member', 'gc.debug.raw',
])

/** 把指令名归一化：去前缀、去引导符、转小写、下划线转连字符 */
export function normalizeCommandName(name: string, prefixes: string[] = []): string {
    let source = name.trim()
    for (const prefix of prefixes.filter(Boolean).sort((a, b) => b.length - a.length)) {
        if (source.startsWith(prefix)) {
            source = source.slice(prefix.length)
            break
        }
    }
    return source.replace(/^[/.!！。]+/, '').toLowerCase().replace(/_/g, '-')
}

/** 收集一个 command 的所有可调用名（name / displayName / alias），归一化后返回 */
export function getCommandNames(command: Command | undefined | null): string[] {
    const names = new Set<string>()
    if (!command) return []
    if (command.name) names.add(normalizeCommandName(command.name))
    const displayName = (command as Command & { displayName?: string }).displayName
    if (displayName) names.add(normalizeCommandName(displayName))
    const aliases = (command as unknown as { _aliases?: Record<string, unknown> })._aliases ?? {}
    for (const alias of Object.keys(aliases)) {
        names.add(normalizeCommandName(alias))
    }
    return [...names]
}

/** 判定一个 command 是否为管理指令（其任一名命中 ADMIN_COMMANDS） */
export function isAdminCommand(command: Command | undefined | null): boolean {
    return getCommandNames(command).some(commandName => ADMIN_COMMANDS.has(commandName))
}
