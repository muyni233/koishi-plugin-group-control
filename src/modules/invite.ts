import { Context } from 'koishi'
import { Config } from '../config'
import { notifyAdmins, escapeTpl, buildVars, hasAdminRole } from '../utils'
import { parseGuildId } from '../utils-id'
import { asOneBotBot, OneBotBot, getBotSelfId, getRawEvent, OneBotMember } from '../types'
import { createLogger, errorMessage } from '../logger'
import {
    addPendingInvite, clearExpiredPendingInvites,
    getBlacklistedGuild, markApprovedGuild, clearApprovedGuild,
} from '../database'

export const name = 'group-control-invite'

const SCOPE = 'group-control:invite'

/** 处理群邀请请求（同意/拒绝），兼容 koishi 标准接口与 OneBot 原始接口。供 commands.ts 复用。 */
export async function handleInviteRequest(bot: OneBotBot, flag: string, approve: boolean, comment = ''): Promise<void> {
    const adapterBot = bot as unknown as { handleGuildRequest?: (flag: string, approve: boolean, comment: string) => Promise<unknown> }
    if (typeof adapterBot.handleGuildRequest === 'function') {
        try {
            await adapterBot.handleGuildRequest(flag, approve, comment)
            return
        } catch {
            // 退到 internal 接口
        }
    }
    await bot.internal.setGroupAddRequest(flag, 'invite', approve, comment)
}

export function apply(ctx: Context, config: Config) {
    if (!config.invite.enabled) return

    const logger = createLogger(ctx, SCOPE, config)

    // 定期清理超时的邀请
    ctx.setInterval(async () => {
        const expireMs = config.invite.inviteExpireDays * 24 * 60 * 60 * 1000
        try {
            for (const bot of ctx.bots) {
                const selfId = getBotSelfId(bot)
                if (selfId && bot.platform) {
                    await clearExpiredPendingInvites(ctx, bot.platform, selfId, expireMs)
                }
            }
            logger.debug('已执行过期邀请清理')
        } catch (err) {
            logger.error('清理过期邀请失败', err)
        }
    }, 60 * 60 * 1000)

    logger.info('invite 模块已加载，正在监听 guild-request 事件')

    ctx.on('guild-request', async (session) => {
        const raw = getRawEvent(session)
        logger.event('guild-request', {
            userId: session.userId,
            guildId: session.guildId,
            messageId: session.messageId,
            type: session.type,
            sub_type: raw.sub_type,
        })

        // guild-request 同时涵盖「被邀请入群(invite)」与「用户申请加入(add)」两种子类型。
        // 本模块只处理被邀请入群；若明确是用户申请进群(add)则跳过。
        const subType = String(raw.sub_type ?? '')
        if (subType && subType !== 'invite') return

        // 提取 flag
        const flag = String(raw.flag ?? session.messageId ?? '')

        // 提取真实的 user_id 和 group_id
        const rawUserId = raw.user_id != null ? String(raw.user_id) : session.userId
        const rawGroupId = raw.group_id != null ? String(raw.group_id) : session.guildId
        const userId = parseGuildId(rawUserId)
        const groupId = parseGuildId(rawGroupId)
        const bot = asOneBotBot(session.bot)
        const selfId = getBotSelfId(bot)
        if (!userId || !groupId || !selfId) {
            logger.warn(`无法解析邀请事件 ID userId=${rawUserId} groupId=${rawGroupId} selfId=${session.bot?.selfId}`)
            return
        }

        const { platform } = session

        // 黑名单拦截：已被拉黑的群邀请一律自动拒绝
        if (config.basic.enableBlacklist) {
            const bl = await getBlacklistedGuild(ctx, groupId)
            if (bl.length > 0) {
                // 尝试拒绝邀请（flag 有可能已失效，做 best-effort）
                try {
                    await handleInviteRequest(bot, flag, false, '该群已被机器人拉黑')
                } catch (err) {
                    logger.warn('拒绝黑名单群邀请失败 (flag 可能已失效)', err)
                }

                // 通知管理员时，如果能拿到群名就拿群名，否则用 ID 兜底
                let groupName = groupId
                try {
                    const guildInfo = await bot.getGuild(groupId) as { name?: string; group_name?: string } | null
                    groupName = guildInfo?.name || guildInfo?.group_name || groupId
                } catch (err) {
                    logger.debug(`获取黑名单群信息失败 groupId=${groupId} ${errorMessage(err)}`)
                }

                // 通知管理员（告知已自动拒绝，以及如何放行）
                const rejectNotify = escapeTpl(config.messages.inviteBlacklistRejectNotification, buildVars({ groupId, groupName, userId }))
                try {
                    await notifyAdmins(ctx, bot, config, rejectNotify)
                } catch (err) {
                    logger.warn('通知管理员（黑名单拒绝）失败', err)
                }

                // 通知邀请者
                try {
                    const rejectMsg = escapeTpl(config.messages.inviteBlacklistRejectPrompt, buildVars({ groupId, groupName, userId }))
                    await bot.sendPrivateMessage(userId, rejectMsg)
                } catch (err) {
                    logger.debug(`通知邀请者（黑名单拒绝）失败 userId=${userId} ${errorMessage(err)}`)
                }

                logger.event('invite.auto-reject-blacklist', { groupId, userId })
                return
            }
        }

        // 获取邀请者与群信息（普通流程，未被拉黑时才进行 API 请求）
        let userName = userId
        try {
            const userInfo = await bot.getUser(userId)
            userName = userInfo?.name || userInfo?.nick || userId
        } catch (err) {
            logger.warn(`获取用户信息失败 userId=${userId}`, err)
        }

        let groupName = groupId
        try {
            const guildInfo = await bot.getGuild(groupId) as { name?: string; group_name?: string } | null
            groupName = guildInfo?.name || guildInfo?.group_name || groupId
        } catch (err) {
            logger.warn(`获取群信息失败 groupId=${groupId}`, err)
        }

        if (!flag) {
            logger.warn(`未能提取到邀请 flag，可能导致无法处理邀请。raw=${JSON.stringify(raw)}`)
        }

        logger.event('invite.received', {
            userId: raw.user_id,
            groupId: raw.group_id,
            flag,
        }, 'debug')

        // 自动同意逻辑（如果邀请者是管理员，或者开启了 autoApprove 自动同意）
        const primaryAdmins = config.admin.primaryAdmins ?? []
        const deputyAdmins = config.admin.deputyAdmins ?? []
        let isAdminInviter = primaryAdmins.includes(userId!)
            || primaryAdmins.includes(rawUserId!)
            || deputyAdmins.includes(userId!)
            || deputyAdmins.includes(rawUserId!)

        // 如果并非直属管理员，但该成员是通知群（大群）的管理员/群主，同样视为管理员邀请并自动豁免
        if (!isAdminInviter && config.admin.notificationGroupId) {
            const notificationGroupId = config.admin.notificationGroupId
            try {
                const member = await bot.getGuildMember(notificationGroupId, userId!)
                if (hasAdminRole(member as any)) {
                    isAdminInviter = true
                }
            } catch {
                try {
                    const info = await bot.internal.getGroupMemberInfo(notificationGroupId, userId!)
                    if (hasAdminRole(info)) {
                        isAdminInviter = true
                    }
                } catch {
                    // 忽略
                }
            }
        }

        if (isAdminInviter || config.invite.autoApprove) {
            try {
                // 先写入白名单表，再同意邀请，避免 API 异步回调 guild-added 并发处理导致的时序 race condition
                await markApprovedGuild(ctx, groupId, selfId)
                await handleInviteRequest(bot, flag, true)
                logger.event(isAdminInviter ? 'invite.admin-approve' : 'invite.auto-approve', { groupId, userId })
            } catch (err) {
                // 如果同意失败，清理刚才写入的临时记录
                await clearApprovedGuild(ctx, groupId, selfId)
                logger.error(isAdminInviter ? '管理员邀请自动同意失败' : '自动同意群聊邀请失败', err)
                return
            }

            // 通知邀请者已自动通过
            try {
                const approveMessage = escapeTpl(config.messages.inviteApprovePrompt, buildVars({
                    groupName, groupId, userName, userId,
                }))
                await bot.sendPrivateMessage(userId, approveMessage)
            } catch (err) {
                logger.warn(`发送自动通过提示失败 userId=${userId}`, err)
            }

            // 通知管理员
            if (isAdminInviter || config.invite.notifyAdminOnApprove) {
                const notifyMessage = escapeTpl(
                    isAdminInviter
                        ? config.messages.inviteAdminApproveNotificationMessage
                        : config.messages.inviteApproveNotificationMessage,
                    buildVars({ groupName, groupId, userName, userId })
                )
                await notifyAdmins(ctx, bot, config, notifyMessage)
            }
            return
        }

        // 以下为人工审核流程

        // 发送等待审核提示给邀请者
        try {
            const waitMessage = escapeTpl(config.messages.inviteWaitPrompt, buildVars({
                groupName, groupId, userName, userId,
            }))

            await bot.sendPrivateMessage(userId, waitMessage)
        } catch (err) {
            logger.warn(`发送等待审核提示失败 userId=${userId}`, err)
        }

        // 未配置任何管理员时，无人审核，直接返回
        const hasAnyAdmin = (config.admin.primaryAdmins?.length ?? 0) > 0
            || (config.admin.deputyAdmins?.length ?? 0) > 0
        if (!hasAnyAdmin) {
            return
        }

        // 存储邀请信息到数据库
        await addPendingInvite(ctx, platform, selfId, {
            groupId,
            userId,
            userName,
            groupName,
            time: Math.floor(Date.now() / 1000),
            flag,
        })

        const requestMessage = escapeTpl(config.messages.inviteRequestMessage, buildVars({
            groupName, groupId, userName, userId,
        }))

        await notifyAdmins(ctx, bot, config, requestMessage)
        logger.debug('已发送群邀请审核通知')
    })
}
