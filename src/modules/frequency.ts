import { Context, Session } from 'koishi'
import { Config } from '../config'
import { getCommandFrequencyRecord, updateCommandFrequencyRecord, CommandFrequencyRecord } from '../database'

export const name = 'group-control-frequency'

const PRIVATE_GUILD_PREFIX = '__private__:'
const frequencyLocks = new Map<string, Promise<void>>()

function isBlocked(record: CommandFrequencyRecord | null): boolean {
    if (!record || !record.blockExpiryTime) return false
    return Date.now() < record.blockExpiryTime * 1000
}

function calcBlockDur(baseDur: number, expBase: number, blockCount: number): number {
    if (expBase <= 1) return baseDur
    return Math.round(baseDur * Math.pow(expBase, blockCount - 1))
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
    let record = await getCommandFrequencyRecord(ctx, platform, guildId)
    const now = Math.floor(Date.now() / 1000)
    const windowStart = now - window

    if (!record) {
        record = makeEmptyRecord(platform, guildId, now)
    } else if (record.lastCommandTime < windowStart) {
        if (isBlocked(record)) {
            // still blocked, don't reset
        } else {
            const blockExpired = record.blockExpiryTime > 0 && (now - record.blockExpiryTime) > expWindow
            record.commandCount = 1
            record.lastCommandTime = now
            record.warningSent = false
            record.firstWarningTime = 0
            if (blockExpired) record.blockCount = 0
        }
    } else {
        record.commandCount += 1
        record.lastCommandTime = now
    }

    // still blocked
    if (isBlocked(record)) {
        const remaining = Math.ceil((record.blockExpiryTime * 1000 - Date.now()) / 1000)
        const lastNotify = record.lastBlockNotifyTime || 0
        if (now - lastNotify >= notifyCooldown) {
            record.lastBlockNotifyTime = now
            await updateCommandFrequencyRecord(ctx, platform, guildId, record)
            return { result: 'blocked', remaining }
        } else {
            await updateCommandFrequencyRecord(ctx, platform, guildId, record)
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
            await updateCommandFrequencyRecord(ctx, platform, guildId, record)
            return { result: 'warn' }
        } else {
            record.blockCount = (record.blockCount || 0) + 1
            const dur = calcBlockDur(baseDur, expBase, record.blockCount)
            record.blockExpiryTime = now + dur
            record.warningSent = false
            record.commandCount = 0
            record.firstWarningTime = 0
            record.lastBlockNotifyTime = now
            await updateCommandFrequencyRecord(ctx, platform, guildId, record)
            return { result: 'new-blocked', dur }
        }
    }

    await updateCommandFrequencyRecord(ctx, platform, guildId, record)
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

    // 记录本条消息是否已被中间件计数，避免同一条消息（私聊指令 / @bot 指令）
    // 在中间件和 command/before-execute 中被重复计数（双重消耗频率额度）
    const countedSessions = new WeakSet<Session>()

    async function checkFrequency(session: Session, isCommand: boolean): Promise<boolean> {
        const isPrivate = !session.guildId
        const platform = session.platform

        if (isPrivate) {
            if (!freq.privateEnabled) return true
            if (freq.privateWhitelist?.includes(session.userId)) return true

            const guildId = PRIVATE_GUILD_PREFIX + session.userId
            const r = await withFrequencyLock(`${platform}:${guildId}`, () =>
                handleTrigger(ctx, platform, guildId,
                    freq.privateLimit, freq.privateWindow, freq.privateWarnDelay,
                    freq.privateBlockDur, freq.blockExpBase, freq.blockExpWindow,
                    freq.blockNotifyCooldown))

            if (r.result === 'ok') return true
            if (r.result === 'warn') {
                try { await session.send(freq.warnMsg) } catch (e) { }
                return false
            }
            if (r.result === 'new-blocked') {
                try { await session.send(freq.blockMsg.replace('{duration}', r.dur.toString())) } catch (e) { }
                return false
            }
            if (r.result === 'blocked') {
                try { await session.send(freq.blockedMsg.replace('{time}', r.remaining.toString())) } catch (e) { }
                return false
            }
            // blocked-silent
            return false
        } else {
            if (!freq.enabled) return true
            if (freq.whitelist?.includes(session.guildId)) return true

            const { guildId } = session
            const r = await withFrequencyLock(`${platform}:${guildId}`, () =>
                handleTrigger(ctx, platform, guildId,
                    freq.limit, freq.window, freq.warnDelay,
                    freq.blockDur, freq.blockExpBase, freq.blockExpWindow,
                    freq.blockNotifyCooldown))

            if (r.result === 'ok') return true
            if (r.result === 'warn') {
                try { await session.bot.sendMessage(guildId, freq.warnMsg, platform) } catch (e) { }
                return false
            }
            if (r.result === 'new-blocked') {
                try { await session.bot.sendMessage(guildId, freq.blockMsg.replace('{duration}', r.dur.toString()), platform) } catch (e) { }
                return false
            }
            if (r.result === 'blocked') {
                try { await session.bot.sendMessage(guildId, freq.blockedMsg.replace('{time}', r.remaining.toString()), platform) } catch (e) { }
                return false
            }
            // blocked-silent
            return false
        }
    }

    // intercept commands
    ctx.on('command/before-execute', async (argv) => {
        const session = argv.session
        if (isSystemSession(session)) return
        // 若该消息已在中间件阶段计数（私聊指令 / @bot 指令），此处不再重复计数
        if (countedSessions.has(session)) return
        const allowed = await checkFrequency(session, true)
        if (!allowed) return ''
    })

    // intercept non-command user messages (direct chat / @ bot)
    ctx.middleware(async (session, next) => {
        if (isSystemSession(session)) return next()
        if (!isUserInitiatedNonCommand(session)) return next()
        // 标记该消息已计数，使后续 command/before-execute 跳过，避免双重消耗
        countedSessions.add(session)
        const allowed = await checkFrequency(session, false)
        if (!allowed) return
        return next()
    }, true)
}
