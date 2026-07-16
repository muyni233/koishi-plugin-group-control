import { Command, Context, Session } from 'koishi'
import { Config } from '../config'
import { getCommandFrequencyRecord, updateCommandFrequencyRecord, CommandFrequencyRecord } from '../database'
import { parseGuildId } from '../utils-id'
import { createLogger, errorMessage } from '../logger'
import { escapeTpl, isAdminCommand, buildVars, SimpleLRUCache } from '../utils'

export const name = 'group-control-frequency'

const SCOPE = 'group-control:frequency'
const PRIVATE_GUILD_PREFIX = '__private__:'
const MAX_BLOCK_DURATION = 24 * 60 * 60
const frequencyLocks = new Map<string, Promise<void>>()
const frequencyCache = new SimpleLRUCache<CommandFrequencyRecord>(1 * 60 * 60 * 1000, 5000)

function isBlocked(record: CommandFrequencyRecord | null): boolean {
    if (!record || !record.blockExpiryTime) return false
    return Date.now() < record.blockExpiryTime * 1000
}

function calcBlockDur(baseDur: number, expBase: number, blockCount: number): number {
    const safeBaseDur = Math.max(0, Math.min(MAX_BLOCK_DURATION, Math.floor(baseDur)))
    if (expBase <= 1 || blockCount <= 1) return safeBaseDur
    const duration = safeBaseDur * Math.pow(expBase, blockCount - 1)
    if (!Number.isFinite(duration)) return MAX_BLOCK_DURATION
    return Math.min(MAX_BLOCK_DURATION, Math.max(0, Math.round(duration)))
}

function makeEmptyRecord(platform: string, guildId: string, now: number): CommandFrequencyRecord {
    return { platform, guildId, commandCount: 1, lastCommandTime: now, warningSent: false, blockExpiryTime: 0, firstWarningTime: 0, blockCount: 0, lastBlockNotifyTime: 0 }
}

async function withFrequencyLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = frequencyLocks.get(key) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>(resolve => { release = resolve })
    const tail = previous.then(() => current, () => current)
    frequencyLocks.set(key, tail)

    await previous.catch(() => { })
    try {
        return await task()
    } finally {
        release()
        if (frequencyLocks.get(key) === tail) frequencyLocks.delete(key)
    }
}

type TriggerResult =
    | { result: 'ok' }
    | { result: 'warn' }
    | { result: 'new-blocked'; dur: number }
    | { result: 'blocked'; remaining: number }
    | { result: 'blocked-silent' }

async function handleTrigger(
    ctx: Context,
    platform: string,
    guildId: string,
    limit: number,
    window: number,
    warnDelay: number,
    baseDur: number,
    expBase: number,
    expWindow: number,
    notifyCooldown: number,
): Promise<TriggerResult> {
    const cacheKey = `${platform}:${guildId}`
    let record = frequencyCache.get(cacheKey)
    if (!record) {
        const dbRecord = await getCommandFrequencyRecord(ctx, platform, guildId)
        if (!dbRecord) {
            record = makeEmptyRecord(platform, guildId, Math.floor(Date.now() / 1000))
        } else {
            record = dbRecord
        }
        frequencyCache.set(cacheKey, record)
    }

    const now = Math.floor(Date.now() / 1000)
    const windowStart = now - window
    let dbWriteNeeded = false

    // Check if block has expired. If so, clear it.
    if (record.blockExpiryTime > 0 && now >= record.blockExpiryTime) {
        const blockResetExpired = (now - record.blockExpiryTime) > expWindow
        record.blockExpiryTime = 0
        if (blockResetExpired) {
            record.blockCount = 0
        }
        dbWriteNeeded = true
    }

    if (record.lastCommandTime < windowStart) {
        if (isBlocked(record)) {
            // still blocked, don't reset
        } else {
            record.commandCount = 1
            record.lastCommandTime = now
            record.warningSent = false
            record.firstWarningTime = 0
        }
    } else {
        if (!isBlocked(record)) {
            record.commandCount += 1
            record.lastCommandTime = now
        }
    }

    // still blocked
    if (isBlocked(record)) {
        const remaining = Math.ceil((record.blockExpiryTime * 1000 - Date.now()) / 1000)
        const lastNotify = record.lastBlockNotifyTime || 0
        if (now - lastNotify >= notifyCooldown) {
            record.lastBlockNotifyTime = now
            dbWriteNeeded = true
            if (dbWriteNeeded) {
                await updateCommandFrequencyRecord(ctx, platform, guildId, record)
            }
            return { result: 'blocked', remaining }
        } else {
            if (dbWriteNeeded) {
                await updateCommandFrequencyRecord(ctx, platform, guildId, record)
            }
            return { result: 'blocked-silent' }
        }
    }

    if (warnDelay > 0 && record.warningSent && record.firstWarningTime > 0 && now - record.firstWarningTime >= warnDelay) {
        record.warningSent = false
        record.firstWarningTime = 0
        record.commandCount = 1
        record.lastCommandTime = now
    }

    // over limit
    if (record.commandCount > limit) {
        if (!record.warningSent) {
            record.warningSent = true
            record.commandCount = 1
            record.lastCommandTime = now
            record.firstWarningTime = now
            if (dbWriteNeeded) {
                await updateCommandFrequencyRecord(ctx, platform, guildId, record)
            }
            return { result: 'warn' }
        } else {
            record.blockCount = (record.blockCount || 0) + 1
            const dur = calcBlockDur(baseDur, expBase, record.blockCount)
            record.blockExpiryTime = now + dur
            record.warningSent = false
            record.commandCount = 0
            record.firstWarningTime = 0
            record.lastBlockNotifyTime = now
            dbWriteNeeded = true
            if (dbWriteNeeded) {
                await updateCommandFrequencyRecord(ctx, platform, guildId, record)
            }
            return { result: 'new-blocked', dur }
        }
    }

    if (dbWriteNeeded) {
        await updateCommandFrequencyRecord(ctx, platform, guildId, record)
    }
    return { result: 'ok' }
}

function isSystemSession(session: Session): boolean {
    if (!session.userId) return true
    if (session.userId === session.bot?.userId) return true
    return false
}

function isUserInitiatedNonCommand(session: Session): boolean {
    if (!session.content) return false
    const mentioned = session.elements?.some(e => e.type === 'at' && e.attrs?.id === session.bot?.userId)
    if (mentioned) return true
    if (!session.guildId) return true
    return false
}

export function apply(ctx: Context, config: Config) {
    const freq = config.frequency
    if (!freq.enabled && !freq.privateEnabled) return
    const logger = createLogger(ctx, SCOPE, config)
    const msgs = config.messages

    ctx.on('dispose', () => {
        frequencyCache.clear()
        // 活动锁必须保留到任务 finally 自行释放，避免热重载的新实例绕过旧任务的互斥链。
    })

    const groupWhitelist = new Set((freq.whitelist ?? []).map(id => parseGuildId(id) ?? id))
    const privateWhitelist = new Set((freq.privateWhitelist ?? []).map(id => parseGuildId(id) ?? id))

    // 普通窗口计数和首次警告只保存在内存，避免逐消息写库；进程重启后允许重置。
    // 数据库仅持久化屏蔽截止时间、处罚次数及屏蔽提示冷却等关键处罚状态。
    // 记录本条消息是否已被中间件计数，避免同一条消息（私聊指令 / @bot 指令）
    // 在中间件和 command/before-execute 中被重复计数（双重消耗频率额度）
    const countedSessions = new WeakSet<Session>()

    async function checkFrequency(session: Session): Promise<boolean> {
        const isPrivate = !session.guildId
        const platform = session.platform

        if (isPrivate) {
            if (!freq.privateEnabled) return true
            if (!session.userId) return true  // 无 userId 不可能限频
            const userId = parseGuildId(session.userId) ?? session.userId
            if (privateWhitelist.has(userId)) return true

            const guildId = PRIVATE_GUILD_PREFIX + userId
            const r = await withFrequencyLock(`${platform}:${guildId}`, () =>
                handleTrigger(ctx, platform, guildId,
                    freq.privateLimit, freq.privateWindow, freq.privateWarnDelay,
                    freq.privateBlockDur, freq.blockExpBase, freq.blockExpWindow,
                    freq.blockNotifyCooldown))

            if (r.result === 'ok') return true
            if (r.result === 'warn') {
                try {
                    await session.send(msgs.frequencyWarnMessage)
                } catch (err) {
                    logger.debug(`发送 warn 消息失败 ${errorMessage(err)}`)
                }
                return false
            }
            if (r.result === 'new-blocked') {
                try {
                    await session.send(escapeTpl(msgs.frequencyBlockMessage, buildVars({ duration: r.dur })))
                } catch (err) {
                    logger.debug(`发送 new-blocked 消息失败 ${errorMessage(err)}`)
                }
                return false
            }
            if (r.result === 'blocked') {
                try {
                    await session.send(escapeTpl(msgs.frequencyBlockedMessage, buildVars({ time: r.remaining })))
                } catch (err) {
                    logger.debug(`发送 blocked 消息失败 ${errorMessage(err)}`)
                }
                return false
            }
            // blocked-silent
            return false
        } else {
            if (!freq.enabled) return true
            if (!session.guildId) return true
            const normalizedGuildId = parseGuildId(session.guildId) ?? session.guildId
            if (groupWhitelist.has(normalizedGuildId)) return true

            const guildId = normalizedGuildId
            const r = await withFrequencyLock(`${platform}:${guildId}`, () =>
                handleTrigger(ctx, platform, guildId,
                    freq.limit, freq.window, freq.warnDelay,
                    freq.blockDur, freq.blockExpBase, freq.blockExpWindow,
                    freq.blockNotifyCooldown))

            if (r.result === 'ok') return true
            if (r.result === 'warn') {
                try {
                    await session.bot.sendMessage(guildId, msgs.frequencyWarnMessage, platform)
                } catch (err) {
                    logger.debug(`发送 warn 消息失败 ${errorMessage(err)}`)
                }
                return false
            }
            if (r.result === 'new-blocked') {
                try {
                    await session.bot.sendMessage(guildId, escapeTpl(msgs.frequencyBlockMessage, buildVars({ duration: r.dur })), platform)
                } catch (err) {
                    logger.debug(`发送 new-blocked 消息失败 ${errorMessage(err)}`)
                }
                return false
            }
            if (r.result === 'blocked') {
                try {
                    await session.bot.sendMessage(guildId, escapeTpl(msgs.frequencyBlockedMessage, buildVars({ time: r.remaining })), platform)
                } catch (err) {
                    logger.debug(`发送 blocked 消息失败 ${errorMessage(err)}`)
                }
                return false
            }
            // blocked-silent
            return false
        }
    }

    // intercept commands
    ctx.on('command/before-execute', async (argv) => {
        const session = argv.session
        if (!session) return
        if (isSystemSession(session)) return
        // 管理指令始终不受频率控制（与 bot-off 豁免保持一致）
        if (isAdminCommand(argv.command)) return
        // 若该消息已在中间件阶段计数（私聊指令 / @bot 指令），此处不再重复计数
        if (countedSessions.has(session)) return
        const allowed = await checkFrequency(session)
        if (!allowed) return ''
    })

    // intercept non-command user messages (direct chat / @ bot)
    ctx.middleware(async (session, next) => {
        if (isSystemSession(session)) return next()
        if (!isUserInitiatedNonCommand(session)) return next()
        // 管理指令不计入频率（argv.command 可能尚未解析，尽力判断）
        const argvCommand = (session as Session & { argv?: { command?: Command } }).argv?.command
        if (argvCommand && isAdminCommand(argvCommand)) return next()
        // 标记该消息已计数，使后续 command/before-execute 跳过，避免双重消耗
        countedSessions.add(session)
        const allowed = await checkFrequency(session)
        if (!allowed) return
        return next()
    }, true)
}
