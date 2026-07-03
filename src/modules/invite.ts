import { Context } from 'koishi'
import { Config } from '../config'
import { notifyAdmins, escapeTpl } from '../utils'
import { parseGuildId } from '../utils-id'
import { asOneBotBot, OneBotBot, getBotSelfId, getRawEvent } from '../types'
import { createLogger, errorMessage } from '../logger'
import {
    addPendingInvite, clearExpiredPendingInvites,
    getBlacklistedGuild, markApprovedGuild,
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
                if (bot.platform) await clearExpiredPendingInvites(ctx, bot.platform, expireMs)
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

                // 通知管理员（告知已自动拒绝，以及如何放行）
                const rejectNotify = `已自动拒绝黑名单群邀请\n群号：${groupId}\n邀请者 QQ：${userId}\n如需放行请先执行 gc.unban ${groupId} 再让对方重新邀请。`
                try {
                    await notifyAdmins(ctx, bot, config, rejectNotify)
                } catch (err) {
                    logger.warn('通知管理员（黑名单拒绝）失败', err)
                }

                // 通知邀请者
                try {
                    const rejectMsg = `您邀请加入的群 ${groupId} 已被机器人拉黑，邀请已被自动拒绝。如有疑问请联系机器人管理员。`
                    await bot.sendPrivateMessage(userId, rejectMsg)
                } catch (err) {
                    logger.debug(`通知邀请者（黑名单拒绝）失败 userId=${userId} ${errorMessage(err)}`)
                }

                logger.event('invite.auto-reject-blacklist', { groupId, userId })
                return
            }
        }

        if (!flag) {
            logger.warn(`未能提取到邀请 flag，可能导致无法处理邀请。raw=${JSON.stringify(raw)}`)
        }

        logger.event('invite.received', {
            userId: raw.user_id,
            groupId: raw.group_id,
            flag,
        }, 'debug')

        // 获取邀请者信息
        let userName = userId
        try {
            const userInfo = await bot.getUser(userId)
            userName = userInfo?.name || userInfo?.nick || userId
        } catch (err) {
            logger.warn(`获取用户信息失败 userId=${userId}`, err)
        }

        // 获取群信息
        let groupName = groupId
        try {
            const guildInfo = await bot.getGuild(groupId) as { name?: string; group_name?: string } | null
            groupName = guildInfo?.name || guildInfo?.group_name || groupId
        } catch (err) {
            logger.warn(`获取群信息失败 groupId=${groupId}`, err)
        }

        // 自动同意逻辑（无论是否配置管理员均可生效）
        if (config.invite.autoApprove) {
            try {
                await handleInviteRequest(bot, flag, true)
                // 记录已审核通过（持久化，永久豁免小群检测，退群时清除）
                await markApprovedGuild(ctx, groupId, selfId)
                logger.event('invite.auto-approve', { groupId, userId })
            } catch (err) {
                logger.error('自动同意群聊邀请失败', err)
                return
            }

            // 通知邀请者已自动通过
            try {
                const approveMessage = escapeTpl(config.invite.inviteApproveMessage, {
                    groupName, groupId, userName, userId,
                })
                await bot.sendPrivateMessage(userId, approveMessage)
            } catch (err) {
                logger.warn(`发送自动通过提示失败 userId=${userId}`, err)
            }

            // 通知管理员
            if (config.invite.notifyAdminOnApprove) {
                const notifyMessage = escapeTpl(config.invite.inviteApproveNotificationMessage, {
                    groupName, groupId, userName, userId,
                })
                await notifyAdmins(ctx, bot, config, notifyMessage)
            }
            return
        }

        // 以下为人工审核流程

        // 发送等待审核提示给邀请者
        try {
            const waitMessage = escapeTpl(config.invite.inviteWaitMessage, {
                groupName, groupId, userName, userId,
            })

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

        const requestMessage = escapeTpl(config.invite.inviteRequestMessage, {
            groupName, groupId, userName, userId,
        })

        await notifyAdmins(ctx, bot, config, requestMessage)
        logger.debug('已发送群邀请审核通知')
    })
}
