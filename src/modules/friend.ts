import { Context } from 'koishi'
import { Config } from '../config'
import { notifyAdmins, escapeTpl } from '../utils'
import { parseGuildId, toOneBotNumber } from '../utils-id'
import { asOneBotBot, getBotSelfId, getRawEvent } from '../types'
import { createLogger, errorMessage } from '../logger'
import {
    addPendingFriendRequest, clearExpiredPendingFriendRequests, getBlacklistedFriend,
} from '../database'

export const name = 'group-control-friend'

const SCOPE = 'group-control-friend'

export function apply(ctx: Context, config: Config) {
    if (!config.friend.enabled) return

    const logger = createLogger(ctx, SCOPE, config)

    // 定期清理过期申请
    ctx.setInterval(async () => {
        const expireMs = config.friend.requestExpireDays * 24 * 60 * 60 * 1000
        try {
            for (const bot of ctx.bots) {
                const selfId = getBotSelfId(bot)
                if (selfId && bot.platform) await clearExpiredPendingFriendRequests(ctx, bot.platform, selfId, expireMs)
            }
        } catch (err) {
            logger.warn('清理过期好友申请失败', err)
        }
    }, 60 * 60 * 1000)

    ctx.on('friend-request', async (session) => {
        const raw = getRawEvent(session)
        const flag = String(raw.flag ?? session.messageId ?? '')
        const userId = parseGuildId(raw.user_id != null ? String(raw.user_id) : (session.userId ?? ''))
        const comment = typeof raw.comment === 'string' ? raw.comment : ''
        const { platform } = session
        const bot = asOneBotBot(session.bot)
        const selfId = getBotSelfId(bot)
        if (!userId || !selfId) {
            logger.warn(`无法解析好友申请 ID userId=${raw.user_id ?? session.userId} selfId=${session.bot?.selfId}`)
            return
        }

        // 好友黑名单拦截：已拉黑的用户发来的申请一律自动拒绝
        if (await getBlacklistedFriend(ctx, userId)) {
            try {
                await bot.internal.setFriendAddRequest(flag, false, '已被拉黑')
            } catch (err) {
                logger.warn('拒绝黑名单好友申请失败', err)
            }
            try {
                await notifyAdmins(ctx, bot, config, `已自动拒绝黑名单好友申请\nQQ：${userId}`)
            } catch (err) {
                logger.warn('通知管理员（黑名单好友拒绝）失败', err)
            }
            logger.event('friend.auto-reject-blacklist', { userId })
            return
        }

        // 获取昵称
        let nickname = userId
        try {
            const userNumber = toOneBotNumber(userId)
            const info = userNumber == null ? null : await bot.internal.getStrangerInfo(userNumber)
            nickname = info?.nickname || nickname
        } catch (err) {
            logger.debug(`getStrangerInfo 失败 userId=${userId} ${errorMessage(err)}`)
        }

        // 自动通过
        if (config.friend.autoApprove) {
            try {
                await bot.internal.setFriendAddRequest(flag, true, '')
                if (config.friend.notifyAdminOnApprove) {
                    const msg = escapeTpl(config.friend.approveNotificationMessage, {
                        userId, nickname, comment,
                    })
                    await notifyAdmins(ctx, bot, config, msg)
                }
            } catch (err) {
                logger.warn('自动通过好友申请失败', err)
            }
            return
        }

        // 存入数据库
        await addPendingFriendRequest(ctx, platform, selfId, {
            userId, nickname, comment, flag, time: Math.floor(Date.now() / 1000),
        })

        // 通知管理员
        const msg = escapeTpl(config.friend.requestMessage, {
            userId, nickname, comment,
        })
        await notifyAdmins(ctx, bot, config, msg)
    })
}
