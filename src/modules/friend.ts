import { Context } from 'koishi'
import { Config } from '../config'
import { notifyAdmins, hasGlobalPermission, parseGuildId, toOneBotNumber, getAdminCommandOptions } from '../utils'
import {
    getPendingFriendRequest, addPendingFriendRequest, removePendingFriendRequest,
    getAllPendingFriendRequests, clearExpiredPendingFriendRequests,
} from '../database'

export const name = 'group-control-friend'

function getBotSelfId(bot: any): string | null {
    return parseGuildId(String(bot?.selfId ?? bot?.userId ?? ''));
}

export function apply(ctx: Context, config: Config) {
    if (!config.friend.enabled) return

    // 定期清理过期申请
    ctx.setInterval(async () => {
        const expireMs = config.friend.requestExpireDays * 24 * 60 * 60 * 1000
        try {
            // 遍历所有 bot 的 platform
            for (const bot of ctx.bots) {
                const selfId = getBotSelfId(bot)
                if (selfId) await clearExpiredPendingFriendRequests(ctx, bot.platform, selfId, expireMs)
            }
        } catch (e) { }
    }, 60 * 60 * 1000)

    ctx.on('friend-request', async (session) => {
        const raw = (session as any).original || (session as any).raw || (session.event as any)?._data || {}
        const flag = raw.flag || (session as any).flag || session.messageId
        const userId = parseGuildId(raw.user_id ? String(raw.user_id) : session.userId)
        const comment = raw.comment || (session as any).comment || ''
        const { platform } = session
        const selfId = getBotSelfId(session.bot)
        if (!userId || !selfId) {
            ctx.logger('group-control-friend').warn(`无法解析好友申请 ID: userId=${raw.user_id ?? session.userId}, selfId=${session.bot?.selfId}`)
            return
        }

        // 获取昵称
        let nickname = userId
        try {
            const userNumber = toOneBotNumber(userId)
            const info = userNumber == null ? null : await (session.bot as any).internal?.getStrangerInfo?.(userNumber)
            nickname = info?.nickname || nickname
        } catch (e) { }

        // 自动通过
        if (config.friend.autoApprove) {
            try {
                await (session.bot as any).internal?.setFriendAddRequest?.(flag, true, '')
                if (config.friend.notifyAdminOnApprove) {
                    const msg = config.friend.approveNotificationMessage
                        .replaceAll('{userId}', userId)
                        .replaceAll('{nickname}', nickname)
                        .replaceAll('{comment}', comment)
                    await notifyAdmins(session.bot, config, msg)
                }
            } catch (e) {
                ctx.logger('group-control-friend').warn('自动通过好友申请失败', e)
            }
            return
        }

        // 存入数据库
        await addPendingFriendRequest(ctx, platform, selfId, { userId, nickname, comment, flag, time: Math.floor(Date.now() / 1000) })

        // 通知管理员
        const msg = config.friend.requestMessage
            .replaceAll('{userId}', userId)
            .replaceAll('{nickname}', nickname)
            .replaceAll('{comment}', comment)
        await notifyAdmins(session.bot, config, msg)
    })

    // ── 指令 ──────────────────────────────────────────────
    const cmdOpts = getAdminCommandOptions(config)

    ctx.command('gc.friend-pending', '查看待处理的好友申请', cmdOpts)
        .alias('gc.fp')
        .action(async ({ session }) => {
            if (!hasGlobalPermission(session, config)) return '权限不足。'
            const selfId = getBotSelfId(session.bot)
            if (!selfId) return '无法识别当前机器人账号，已取消操作。'
            const all = await getAllPendingFriendRequests(ctx, session.platform, selfId)
            if (all.length === 0) return '当前没有待处理的好友申请。'
            const lines = ['待处理好友申请列表：']
            for (const r of all) {
                const elapsed = Math.floor((Date.now() / 1000 - r.time) / 60)
                lines.push(`- ${r.nickname}（${r.userId}）附言：${r.comment || '无'} · ${elapsed} 分钟前`)
                lines.push(`  同意：gc.friend-approve ${r.userId} | 拒绝：gc.friend-reject ${r.userId}`)
            }
            return lines.join('\n')
        })

    ctx.command('gc.friend-approve <userId:string>', '同意好友申请', cmdOpts)
        .alias('gc.fa')
        .action(async ({ session }, userId) => {
            if (!hasGlobalPermission(session, config)) return '权限不足。'
            if (!userId) return '请指定QQ号。用法：gc.friend-approve <QQ号>'
            userId = parseGuildId(userId)
            if (!userId) return '输入格式错误，请输入 QQ 号。'
            const selfId = getBotSelfId(session.bot)
            if (!selfId) return '无法识别当前机器人账号，已取消操作。'
            const record = await getPendingFriendRequest(ctx, session.platform, selfId, userId)
            if (!record) return `未找到来自 ${userId} 的待处理好友申请。`
            try {
                await (session.bot as any).internal?.setFriendAddRequest?.(record.flag, true, '')
                await removePendingFriendRequest(ctx, session.platform, selfId, userId)
                return `已同意 ${record.nickname}（${userId}）的好友申请。`
            } catch (e) {
                return `处理失败：${e.message}`
            }
        })

    ctx.command('gc.friend-reject <userId:string>', '拒绝好友申请', cmdOpts)
        .alias('gc.fr')
        .action(async ({ session }, userId) => {
            if (!hasGlobalPermission(session, config)) return '权限不足。'
            if (!userId) return '请指定QQ号。用法：gc.friend-reject <QQ号>'
            userId = parseGuildId(userId)
            if (!userId) return '输入格式错误，请输入 QQ 号。'
            const selfId = getBotSelfId(session.bot)
            if (!selfId) return '无法识别当前机器人账号，已取消操作。'
            const record = await getPendingFriendRequest(ctx, session.platform, selfId, userId)
            if (!record) return `未找到来自 ${userId} 的待处理好友申请。`
            try {
                await (session.bot as any).internal?.setFriendAddRequest?.(record.flag, false, '')
                await removePendingFriendRequest(ctx, session.platform, selfId, userId)
                return `已拒绝 ${record.nickname}（${userId}）的好友申请。`
            } catch (e) {
                return `处理失败：${e.message}`
            }
        })
}
