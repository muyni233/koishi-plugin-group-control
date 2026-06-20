import { Context, Session } from 'koishi'
import { Config } from '../config'
import { notifyAdmins, hasGuildPermission, getAdminCommandOptions, escapeTpl } from '../utils'
import { parseGuildId, toOneBotNumber } from '../utils-id'
import {
    asOneBotBot, OneBotBot, OneBotInternalRaw, OneBotMember,
    getBotSelfId, getMemberUserId, getRawEvent,
} from '../types'
import { createLogger, errorMessage, ScopedLogger } from '../logger'
import {
    isInSmallGroupWhitelist, getPendingInvite, removePendingInvite,
    markSelfLeft, consumeSelfLeft, clearSelfLeft, clearExpiredSelfLeft,
    blacklistKicked, createBlacklistedGuild, isApprovedGuild, clearApprovedGuild,
    getBlacklistedGuild, getGroupBotStatus, BLACKLIST_PLATFORM,
} from '../database'

export const name = 'group-control-basic'

const SCOPE = 'group-control:basic'

function makeGuildKey(platform: string, selfId: string, guildId: string): string {
    return `${platform}:${selfId}:${guildId}`
}

async function leaveGroup(bot: OneBotBot, guildId: string): Promise<void> {
    const groupId = toOneBotNumber(guildId)
    if (groupId == null) throw new Error(`无效群号: ${guildId}`)
    await bot.internal.setGroupLeave(groupId)
}

/** 尝试获取群名称，失败时返回 '未知' */
async function getGroupName(bot: OneBotBot, guildId: string, logger: ScopedLogger): Promise<string> {
    try {
        const groupId = toOneBotNumber(guildId)
        if (groupId != null) {
            const info = await bot.internal.getGroupInfo(groupId)
            if (info?.group_name) return info.group_name
        }
    } catch (err) {
        logger.debug(`getGroupInfo 失败 guildId=${guildId} ${errorMessage(err)}`)
    }
    try {
        const info = await bot.getGuild(guildId) as { name?: string; group_name?: string } | null
        if (info?.name) return info.name
        if (info?.group_name) return info.group_name
    } catch (err) {
        logger.debug(`getGuild 失败 guildId=${guildId} ${errorMessage(err)}`)
    }
    return '未知'
}

/** 小群检测结果。count 为用于判定/展示的人数（排除官方机器人后为真人数） */
interface SmallGroupResult {
    /** quit: 应退群；keep: 人数达标保留；unknown: 无法判定（不操作） */
    decision: 'quit' | 'keep' | 'unknown'
    count: number
    groupName: string
}

async function getGroupMemberList(bot: OneBotBot, guildId: string, logger: ScopedLogger): Promise<OneBotMember[]> {
    try {
        const groupId = toOneBotNumber(guildId)
        if (groupId != null) {
            return await bot.internal.getGroupMemberList(groupId)
        }
    } catch (err) {
        logger.debug(`internal.getGroupMemberList 失败 guildId=${guildId} ${errorMessage(err)}`)
    }
    return []
}

/**
 * 从 get_robot_uin_range 的原始返回里解析出号段区间数组。
 * 兼容 { data: [...] } 包裹与裸数组，以及字段名 minUin/maxUin（或 min/max）。
 * 区间端点统一转成 number（官方机器人号段最大 ~4e9，远在安全整数内）。
 */
function parseRobotUinRanges(raw: unknown): { min: number; max: number }[] | null {
    const arr = Array.isArray(raw) ? raw
        : (raw as { data?: unknown } | null | undefined)?.data
    if (!Array.isArray(arr)) return null
    const out: { min: number; max: number }[] = []
    for (const item of arr) {
        const obj = item as Record<string, unknown> | null
        if (!obj) continue
        const minRaw = obj.minUin ?? obj.min
        const maxRaw = obj.maxUin ?? obj.max
        const min = Number(minRaw)
        const max = Number(maxRaw)
        if (!Number.isFinite(min) || !Number.isFinite(max)) continue
        out.push({ min, max: max < min ? min : max })
    }
    return out.length > 0 ? out : null
}

/** 判定一个纯数字 uin 是否落在任一官方机器人号段区间内 */
function isUinInRobotRange(uin: string, ranges: { min: number; max: number }[]): boolean {
    const n = Number(uin)
    if (!Number.isFinite(n)) return false
    for (const r of ranges) {
        if (n >= r.min && n <= r.max) return true
    }
    return false
}

export function apply(ctx: Context, config: Config) {
    const logger = createLogger(ctx, SCOPE, config)

    // 使用 Map 记录主动退群的时间戳，保留一段时间防止 guild-removed 多次触发
    const quittingGuilds = new Map<string, number>()
    // 记录已经处理过的被踢事件，防止重复通知
    const processedKicks = new Map<string, number>()
    // 记录已处理过的 guild-added，防止 OneBot 重连/重放导致重复检测与重复通知
    const processedAdds = new Map<string, number>()
    // 实时监控：记录每个群上次复检时间，做冷却限流
    const realtimeLastCheck = new Map<string, number>()

    // 官方机器人号段区间缓存（per-bot，号段基本不变，进程级缓存一次即可）
    // 仅 smallGroupRobotUinRangeMode 开启时使用
    const robotUinRangeCache = new Map<string, { min: number; max: number }[] | null>()

    /** 获取官方机器人号段区间。返回 null 表示接口不可用/调用失败（调用方应回退 is_robot）。
     *  null 会被缓存以避免反复调用不可用的接口。
     *
     *  get_robot_uin_range 是非标准接口，adapter-onebot 没有为它生成封装方法，
     *  故通过底层 _get 通道直接调用（标准方法内部同样走 _get）。 */
    async function getRobotUinRanges(bot: OneBotBot): Promise<{ min: number; max: number }[] | null> {
        const selfId = getBotSelfId(bot) ?? ''
        const cacheKey = selfId || '_default'
        if (robotUinRangeCache.has(cacheKey)) return robotUinRangeCache.get(cacheKey) ?? null
        let ranges: { min: number; max: number }[] | null = null
        try {
            const internal = bot.internal as OneBotInternalRaw
            const raw = await internal._get('get_robot_uin_range')
            ranges = parseRobotUinRanges(raw)
            if (!ranges) logger.debug('get_robot_uin_range 返回无法解析的号段数据，回退 is_robot')
        } catch (err) {
            logger.debug(`get_robot_uin_range 调用失败，回退 is_robot ${errorMessage(err)}`)
        }
        robotUinRangeCache.set(cacheKey, ranges)
        return ranges
    }

    const QUITTING_EXPIRE_MS = 60 * 1000  // 60秒后过期
    const KICK_DEDUP_MS = 60 * 1000       // 60秒内同一群的踢出不重复处理
    const ADD_DEDUP_MS = 10 * 1000        // 10秒内同一群的 guild-added 视为重放
    const REALTIME_DEBOUNCE_MS = 1500     // 实时复检前的防抖（合并瞬时连续退群）

    function isRecent(map: Map<string, number>, key: string, ttl: number): boolean {
        const time = map.get(key)
        if (!time) return false
        if (Date.now() - time <= ttl) return true
        map.delete(key)
        return false
    }

    // 定期清理过期的记录
    ctx.setInterval(() => {
        const now = Date.now()
        for (const [key, time] of quittingGuilds) {
            if (now - time > QUITTING_EXPIRE_MS) quittingGuilds.delete(key)
        }
        for (const [key, time] of processedKicks) {
            if (now - time > KICK_DEDUP_MS) processedKicks.delete(key)
        }
        for (const [key, time] of processedAdds) {
            if (now - time > ADD_DEDUP_MS) processedAdds.delete(key)
        }
        // 实时复检冷却记录：超过 5 分钟无新事件即可清理
        for (const [key, time] of realtimeLastCheck) {
            if (now - time > 5 * 60 * 1000) realtimeLastCheck.delete(key)
        }
    }, 30 * 1000)

    // 定期清理过期的持久化主动退群标记（guild-removed 未触发时的兜底）
    ctx.setInterval(async () => {
        try {
            await clearExpiredSelfLeft(ctx)  // 默认 5 分钟过期
        } catch (err) {
            logger.warn('清理过期 selfLeft 标记失败', err)
        }
    }, 5 * 60 * 1000)

    /**
     * 评估一个群是否为「小群」。
     *
     * 排除官方机器人时采用分级短路，尽量少调用接口、少遍历：
     *   1. 原始人数 ≤ 阈值          → 直接判定 quit（无需拉成员列表）
     *   2. 原始人数 > 阈值 + 机器人上限 → 直接判定 keep（即使全是机器人也不可能变小群）
     *   3. 介于两者之间（模糊区间）  → 拉一次成员列表，统计 is_robot/自身，
     *      一旦机器人数足以使「真人数 ≤ 阈值」即提前结束遍历。
     */
    async function evaluateSmallGroup(bot: OneBotBot, guildId: string): Promise<SmallGroupResult> {
        const threshold = config.basic.smallGroupThreshold
        const exclude = config.basic.smallGroupExcludeOfficialBots
        const maxBots = 20  // 单群官方机器人数量上限固定为 20

        // —— 步骤1：轻量获取原始总人数与群名 ——
        let total = 0
        let groupName = '未知'
        try {
            const groupId = toOneBotNumber(guildId)
            if (groupId != null) {
                const info = await bot.internal.getGroupInfo(groupId)
                total = Number(info?.member_count) || 0
                if (info?.group_name) groupName = info.group_name
            }
        } catch (err) {
            logger.debug(`getGroupInfo 失败 guildId=${guildId} ${errorMessage(err)}`)
        }
        if (total === 0) {
            try {
                const guildInfo = await bot.getGuild(guildId) as
                    | { name?: string; member_count?: number; memberCount?: number }
                    | null
                total = Number(guildInfo?.member_count ?? guildInfo?.memberCount) || 0
                if (guildInfo?.name) groupName = guildInfo.name
            } catch (err) {
                logger.debug(`getGuild 兜底失败 guildId=${guildId} ${errorMessage(err)}`)
            }
        }

        // —— 步骤2：基于原始人数的短路判定 ——
        if (total > 0 && total <= threshold) {
            return { decision: 'quit', count: total, groupName }
        }
        if (!exclude) {
            if (total > 0) return { decision: total <= threshold ? 'quit' : 'keep', count: total, groupName }
            // total 未知时落到成员列表兜底
        } else if (total > threshold + maxBots) {
            return { decision: 'keep', count: total, groupName }
        }

        // —— 步骤3：模糊区间（或原始人数未知），拉一次成员列表统计 ——
        const list = await getGroupMemberList(bot, guildId, logger)
        logger.event('smallGroup.list', {
            guildId, total, threshold, listLength: list.length,
        }, 'debug')
        if (list.length > 0) {
            const sample = list[0]
            logger.event('smallGroup.sample', {
                guildId,
                keys: Object.keys(sample ?? {}).join(','),
                is_robot: sample?.is_robot,
            }, 'debug')
            // 调试模式下打印各成员 is_robot，用于排查适配器是否正确返回该字段
            logger.debug(`[smallGroup.memberDetails] guildId=${guildId} 共 ${list.length} 个成员（前30个）：`)
            for (let i = 0; i < Math.min(list.length, 30); i++) {
                const m = list[i]
                logger.debug(`  [${i}] uid=${getMemberUserId(m)} is_robot=${JSON.stringify(m.is_robot)}`)
            }
        }

        if (list.length === 0) {
            // 无法获取列表：用原始人数兜底，仍拿不到则放弃
            if (total > 0) return { decision: total <= threshold ? 'quit' : 'keep', count: total, groupName }
            return { decision: 'unknown', count: 0, groupName }
        }

        const N = list.length
        if (!exclude) return { decision: N <= threshold ? 'quit' : 'keep', count: N, groupName }
        if (N <= threshold) return { decision: 'quit', count: N, groupName }

        // 统计机器人：当 bots ≥ N - threshold 时，真人数必 ≤ 阈值，可提前结束
        const selfId = getBotSelfId(bot)
        const botsNeeded = N - threshold

        // 号段模式：开关开启时改用 get_robot_uin_range 号段区间判定官方机器人
        // （适配器 is_robot 字段失效时的临时方案）。号段拿不到则回退 is_robot。
        let robotRanges: { min: number; max: number }[] | null = null
        let useRangeMode = false
        if (config.logging.smallGroupRobotUinRangeMode) {
            robotRanges = await getRobotUinRanges(bot)
            useRangeMode = robotRanges !== null
            if (useRangeMode) {
                logger.event('smallGroup.robotUinRange', { guildId, ranges: robotRanges!.length }, 'debug')
            }
        }
        const isBot = (m: OneBotMember): boolean => {
            if (selfId && getMemberUserId(m) === selfId) return true
            if (useRangeMode) return isUinInRobotRange(getMemberUserId(m), robotRanges!)
            return m.is_robot === true
        }

        let bots = 0
        for (const m of list) {
            if (isBot(m)) {
                bots++
                if (bots >= botsNeeded) {
                    // 真人数 = N - bots ≤ threshold，判定为小群，无需继续遍历
                    logger.event('smallGroup.decision', {
                        guildId, total: N, bots, real: N - bots, threshold, decision: 'quit-early',
                        mode: useRangeMode ? 'uin-range' : 'is_robot',
                    })
                    return { decision: 'quit', count: N - bots, groupName }
                }
            }
        }
        const real = N - bots
        logger.event('smallGroup.decision', {
            guildId, total: N, bots, real, threshold,
            decision: real <= threshold ? 'quit' : 'keep',
            mode: useRangeMode ? 'uin-range' : 'is_robot',
        })
        return { decision: real <= threshold ? 'quit' : 'keep', count: real, groupName }
    }

    /** 执行小群退群：群内提示 + 通知管理员 + 标记主动退群 + 退群（失败回滚） */
    async function performSmallGroupQuit(
        bot: OneBotBot,
        platform: string,
        guildId: string,
        groupName: string,
        memberCount: number,
    ): Promise<void> {
        const selfId = getBotSelfId(bot) ?? ''
        const dedupKey = makeGuildKey(platform, selfId, guildId)
        const threshold = config.basic.smallGroupThreshold
        const quitMsg = escapeTpl(config.basic.smallGroupQuitMessage, {
            memberCount, threshold, groupName, groupId: guildId,
        })
        try {
            await bot.sendMessage(guildId, quitMsg, platform)
        } catch (err) {
            logger.debug(`小群退群提示发送失败 guildId=${guildId} ${errorMessage(err)}`)
        }

        if (config.basic.smallGroupNotifyAdmin) {
            const adminMsg = `小群自动退群\n群名称：${groupName}\n群号：${guildId}\n群成员数：${memberCount}人（阈值：${threshold}人）\n机器人已自动退出该群。`
            await notifyAdmins(ctx, bot, config, adminMsg)
        }

        // 标记为主动退出，避免触发被踢拉黑逻辑
        quittingGuilds.set(dedupKey, Date.now())
        await markSelfLeft(ctx, guildId, selfId)
        try {
            await leaveGroup(bot, guildId)
        } catch (err) {
            logger.error(`小群自动退群失败 guildId=${guildId}`, err)
            quittingGuilds.delete(dedupKey)
            await clearSelfLeft(ctx, guildId, selfId)
        }
    }

    /** 发送欢迎消息。bot-off（群开关关闭）时不发送——事件监听器不走中间件，需在此显式判断。 */
    async function sendWelcome(bot: OneBotBot, platform: string, guildId: string): Promise<void> {
        if (!config.basic.welcomeMessage) return
        // bot-off 时阻止主动欢迎（与 bot-off 文案承诺一致）
        if (config.botSwitch?.enabled) {
            const status = await getGroupBotStatus(ctx, platform, guildId)
            const isBotEnabled = status ? status.botEnabled : config.botSwitch.defaultState
            if (!isBotEnabled) return
        }
        try {
            await bot.sendMessage(guildId, config.basic.welcomeMessage, platform)
        } catch (err) {
            logger.warn(`欢迎消息发送失败 guildId=${guildId}`, err)
        }
    }

    ctx.on('guild-added', async (session) => {
        const { platform } = session
        const guildId = parseGuildId(session.guildId)
        if (!guildId) return
        const bot = asOneBotBot(session.bot)
        const selfId = getBotSelfId(bot) ?? ''
        logger.event('guild-added', { guildId, platform })

        // guild-added 去重：防止 OneBot 重连/重放导致重复欢迎与重复小群检测
        const addKey = makeGuildKey(platform, selfId, guildId)
        if (isRecent(processedAdds, addKey, ADD_DEDUP_MS)) {
            logger.event('guild-added.duplicate', { guildId })
            return
        }
        processedAdds.set(addKey, Date.now())

        // 检查黑名单
        if (config.basic.enableBlacklist) {
            const [blacklisted] = await getBlacklistedGuild(ctx, guildId)
            if (blacklisted) {
                try {
                    await bot.sendMessage(guildId, config.basic.blacklistMessage, platform)
                } catch (err) {
                    logger.debug(`黑名单提示发送失败 guildId=${guildId} ${errorMessage(err)}`)
                }
                quittingGuilds.set(addKey, Date.now())
                await markSelfLeft(ctx, guildId, selfId)
                try {
                    await leaveGroup(bot, guildId)
                } catch (err) {
                    logger.warn(`退出黑名单群失败 guildId=${guildId}`, err)
                }
                return
            }
        }

        // 小群自动退群检测（延迟再获取群信息以确保准确）。
        // 小群/黑名单群不发欢迎；豁免群（白名单/已审核/待处理邀请）直接欢迎；
        // 未审核群先做小群检测，确认非小群后再欢迎。
        if (config.basic.smallGroupAutoQuit) {
            const inWhitelist = await isInSmallGroupWhitelist(ctx, guildId)
            const wasApproved = await isApprovedGuild(ctx, guildId, selfId)
            const pendingInvite = await getPendingInvite(ctx, platform, guildId, selfId)
            const hadPendingInvite = !!pendingInvite
            if (hadPendingInvite) await removePendingInvite(ctx, platform, guildId, selfId)

            if (inWhitelist || wasApproved || hadPendingInvite) {
                // 豁免：直接欢迎
                await sendWelcome(bot, platform, guildId)
            } else {
                // 未审核：延迟小群检测，非小群才欢迎
                const delay = config.basic.smallGroupCheckDelay || 3000
                ctx.setTimeout(async () => {
                    try {
                        const res = await evaluateSmallGroup(bot, guildId)
                        if (res.decision === 'quit') {
                            let groupName = res.groupName
                            if (groupName === '未知') groupName = await getGroupName(bot, guildId, logger)
                            await performSmallGroupQuit(bot, platform, guildId, groupName, res.count)
                            return  // 小群：已退群，不发欢迎
                        }
                        if (res.decision === 'keep' && config.basic.smallGroupQualifiedNotifyAdmin) {
                            let groupName = res.groupName
                            if (groupName === '未知') groupName = await getGroupName(bot, guildId, logger)
                            const qualifiedMsg = escapeTpl(config.basic.smallGroupQualifiedMessage, {
                                groupName, groupId: guildId,
                                memberCount: res.count,
                                threshold: config.basic.smallGroupThreshold,
                            })
                            await notifyAdmins(ctx, bot, config, qualifiedMsg)
                        }
                    } catch (err) {
                        logger.error(`小群自动退群检测失败 guildId=${guildId}`, err)
                    }
                    // keep / unknown / 检测失败：发送欢迎
                    await sendWelcome(bot, platform, guildId)
                }, delay)
            }
        } else {
            // 未启用小群检测：直接欢迎
            await sendWelcome(bot, platform, guildId)
        }
    })

    // ======== 实时小群监控 ========
    // 只有「成员退群」才可能让群变小，故仅监听该事件，不做任何轮询。
    // 配合 per-群冷却 + 防抖，仅在群真正缩小时才发起一次轻量复检。
    if (config.basic.smallGroupAutoQuit && config.basic.smallGroupRealtimeMonitor) {
        ctx.on('guild-member-removed', async (session) => {
            const { platform } = session
            const guildId = parseGuildId(session.guildId)
            if (!guildId) return
            const bot = asOneBotBot(session.bot)
            const selfId = getBotSelfId(bot) ?? ''
            const dedupKey = makeGuildKey(platform, selfId, guildId)
            // 机器人自身退群由 guild-removed 处理，忽略
            if (parseGuildId(session.userId) === selfId) return
            // 已在退群流程中的群跳过
            if (quittingGuilds.has(dedupKey)) return

            // 冷却限流（内存判断，先于数据库查询，避免频繁查库）：同一群两次复检的最小间隔
            const cooldown = (config.basic.smallGroupRecheckCooldown || 60) * 1000
            const now = Date.now()
            if (now - (realtimeLastCheck.get(dedupKey) || 0) < cooldown) return
            realtimeLastCheck.set(dedupKey, now)

            // 白名单群、已审核通过的群永久豁免实时监控（仅监控未经审核被拉入的群）
            if (await isInSmallGroupWhitelist(ctx, guildId)) return
            if (await isApprovedGuild(ctx, guildId, selfId)) return

            // 防抖：合并瞬时连续退群，稍后再复检
            ctx.setTimeout(async () => {
                try {
                    if (quittingGuilds.has(dedupKey)) return
                    const res = await evaluateSmallGroup(bot, guildId)
                    if (res.decision === 'quit') {
                        let groupName = res.groupName
                        if (groupName === '未知') groupName = await getGroupName(bot, guildId, logger)
                        await performSmallGroupQuit(bot, platform, guildId, groupName, res.count)
                    }
                } catch (err) {
                    logger.error(`实时小群检测失败 guildId=${guildId}`, err)
                }
            }, REALTIME_DEBOUNCE_MS)
        })
    }

    ctx.on('guild-removed', async (session) => {
        const guildId = parseGuildId(session.guildId)
        if (!guildId) return
        const bot = asOneBotBot(session.bot)
        const selfId = getBotSelfId(bot) ?? ''
        // 统一使用 BLACKLIST_PLATFORM，确保与 gc.ban/gc.unban 操作同一行
        const platform = BLACKLIST_PLATFORM
        const dedupKey = makeGuildKey(platform, selfId, guildId)

        // 离开群（无论主动退/被踢）即清除「已审核」标记
        try { await clearApprovedGuild(ctx, guildId, selfId) } catch (err) {
            logger.debug(`清理 approvedGuild 失败 guildId=${guildId} ${errorMessage(err)}`)
        }

        // 1) 在进程内主动退群的，快速放行（同时消费持久标记，防止堆积）
        if (quittingGuilds.has(dedupKey)) {
            try { await clearSelfLeft(ctx, guildId, selfId) } catch (err) {
                logger.debug(`清理 selfLeft 失败 guildId=${guildId} ${errorMessage(err)}`)
            }
            return
        }

        // 2) 持久化主动退群标记：跨重启/HMR 仍然有效
        const isSelfLeft = await consumeSelfLeft(ctx, guildId, selfId)
        if (isSelfLeft) return

        // 3) 根据 OneBot 原始事件判断是主动退 (leave) 还是被踢 (kick_me/kick)
        const raw = getRawEvent(session)
        const subType = String(raw.sub_type ?? '')
        const eventTs = typeof raw.time === 'number' ? raw.time : Math.floor(Date.now() / 1000)
        const ageSec = Math.floor(Date.now() / 1000) - eventTs

        // 明确的主动退群 (OneBot group_decrease sub_type === 'leave')
        if (subType === 'leave') return

        // 4) 过旧事件：可能是重连重放，忽略（仅在无 sub_type 时兜底）
        if (!subType && ageSec > 60) return

        // 5) 进程内去重（同名群 60s 内只处理一次）
        if (isRecent(processedKicks, dedupKey, KICK_DEDUP_MS)) return
        processedKicks.set(dedupKey, Date.now())

        // 6) 持久化幂等：已经被自动踢出拉黑的（reason === 'kicked'）不再重复通知
        if (config.basic.enableBlacklist || config.basic.notifyAdminOnKick) {
            const [existing] = await getBlacklistedGuild(ctx, guildId)
            if (existing && existing.reason === 'kicked') {
                return
            }
        }

        // 7) 写入黑名单（仅 enableBlacklist 开启时）
        if (config.basic.enableBlacklist) {
            await blacklistKicked(ctx, guildId)
        }

        // 8) 通知管理员（独立于 enableBlacklist 的开关）
        if (config.basic.notifyAdminOnKick) {
            const groupName = await getGroupName(bot, guildId, logger)
            const kickMsg = escapeTpl(config.basic.kickNotificationMessage, {
                groupId: guildId, groupName,
            })
            await notifyAdmins(ctx, bot, config, kickMsg)
        }
    })

    // 被禁言通知 / 被长时间禁言自动退群拉黑
    if (config.basic.notifyAdminOnMute || config.basic.muteAutoQuit) {
        ctx.on('guild-member-mute', async (session: Session) => {
            // 只关心 bot 自己被禁言
            const bot = asOneBotBot(session.bot)
            const selfId = getBotSelfId(bot) ?? ''
            if (parseGuildId(session.userId) !== selfId) return
            // duration 为 0 表示解除禁言，不处理
            const sessionExt = session as Session & { duration?: number; operatorId?: string }
            if (!sessionExt.duration) return

            const { platform } = session
            const guildId = parseGuildId(session.guildId)
            if (!guildId) return
            const operatorId = sessionExt.operatorId || '未知'
            const duration = sessionExt.duration ?? 0
            const groupName = await getGroupName(bot, guildId, logger)

            // 被禁言时长达到阈值：自动退群并拉黑（优先于普通通知）
            if (config.basic.muteAutoQuit && duration >= config.basic.muteAutoQuitThreshold) {
                const quitMsg = escapeTpl(config.basic.muteQuitNotificationMessage, {
                    groupId: guildId, groupName, operatorId, duration,
                })
                await notifyAdmins(ctx, bot, config, quitMsg)

                // 拉入黑名单（reason='muted'，避免被 guild-removed 当作被踢重复处理）
                try {
                    await createBlacklistedGuild(ctx, guildId, 'muted')
                } catch (err) {
                    logger.warn(`写入禁言黑名单失败 guildId=${guildId}`, err)
                }

                // 标记主动退群并退出（被禁言状态下无法发群消息，故不再尝试群内提示）
                const dedupKey = makeGuildKey(platform, selfId, guildId)
                quittingGuilds.set(dedupKey, Date.now())
                await markSelfLeft(ctx, guildId, selfId)
                try {
                    await leaveGroup(bot, guildId)
                } catch (err) {
                    logger.error(`被禁言自动退群失败 guildId=${guildId}`, err)
                    quittingGuilds.delete(dedupKey)
                    await clearSelfLeft(ctx, guildId, selfId)
                }
                return
            }

            // 普通被禁言通知
            if (config.basic.notifyAdminOnMute) {
                const msg = escapeTpl(config.basic.muteNotificationMessage, {
                    groupId: guildId, groupName, operatorId, duration,
                })
                await notifyAdmins(ctx, bot, config, msg)
            }
        })
    }

    if (config.basic.quitCommandEnabled) {
        const cmdOpts = getAdminCommandOptions(config)

        ctx.command('quit', '让机器人主动退出当前群聊', cmdOpts)
            .action(async ({ session }) => {
                if (!session) return ''
                if (!session.guildId) return 'quit 指令只能在群聊中使用。'

                // 内置权限检查
                if (config.permission.mode === 'builtin') {
                    const hasPerm = await hasGuildPermission(session, config)
                    if (!hasPerm) return '权限不足，只有群管理员可以使用此指令。'
                }

                const { platform, userId } = session
                if (!userId) return '无法识别用户身份，已取消操作。'
                const guildId = parseGuildId(session.guildId)
                if (!guildId) return '当前群号格式无效，无法退出。'
                const bot = asOneBotBot(session.bot)
                const selfId = getBotSelfId(bot) ?? ''
                const dedupKey = makeGuildKey(platform, selfId, guildId)

                // 获取群名称（此时还在群内，应该能拿到）
                const groupName = await getGroupName(bot, guildId, logger)

                // 通知管理员
                const adminMsg = `收到来自 ${userId} 的退群指令\n群名称：${groupName}\n群号：${guildId}`
                await notifyAdmins(ctx, bot, config, adminMsg)

                quittingGuilds.set(dedupKey, Date.now())
                await markSelfLeft(ctx, guildId, selfId)
                try {
                    await bot.sendMessage(session.guildId, escapeTpl(config.basic.quitMessage, { userId }), platform)
                } catch (err) {
                    logger.debug(`quit 群内提示发送失败 guildId=${guildId} ${errorMessage(err)}`)
                }
                try {
                    await leaveGroup(bot, guildId)
                } catch (err) {
                    quittingGuilds.delete(dedupKey)
                    await clearSelfLeft(ctx, guildId, selfId)
                    return `退出失败: ${errorMessage(err)}`
                }
                return ''
            })
    }
}
