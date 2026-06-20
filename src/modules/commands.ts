import { Context, Session } from 'koishi'
import { Config } from '../config'
import { isBlacklistEnabled, hasGlobalPermission, getAdminCommandOptions } from '../utils'
import { parseGuildId, toOneBotNumber, formatDate } from '../utils-id'
import { asOneBotBot, getBotSelfId, OneBotForwardNode, OneBotFriend, OneBotGroupInfo, OneBotMember } from '../types'
import { createLogger, errorMessage, isVerbose } from '../logger'
import {
    getAllBlacklistedGuilds, getBlacklistedGuild, createBlacklistedGuild, clearBlacklistedGuilds, removeBlacklistedGuild,
    addToSmallGroupWhitelist, removeFromSmallGroupWhitelist, getAllSmallGroupWhitelist, isInSmallGroupWhitelist,
    clearSelfLeft, markSelfLeft,
} from '../database'

export const name = 'group-control-commands'

const SCOPE = 'group-control:commands'

/** 将数组按 size 切片 */
function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = []
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
    return out
}

/**
 * 以合并转发形式把多行文本发送到当前会话；
 * 若适配器不支持合并转发接口，则降级为分段纯文本发送。
 */
async function sendAsForward(session: Session, title: string, lines: string[]): Promise<void> {
    const groups = chunk(lines, 80)  // 每个转发节点最多 80 行，避免单条过大
    const botId = String(session.bot?.selfId || '10000')
    const nodes: OneBotForwardNode[] = groups.map(g => ({
        type: 'node',
        data: { user_id: botId, nickname: title, content: g.join('\n') },
    }))
    try {
        const internal = asOneBotBot(session.bot).internal
        if (session.guildId) {
            if (typeof internal?.sendGroupForwardMsg !== 'function') throw new Error('no forward api')
            const guildId = toOneBotNumber(session.guildId)
            if (guildId == null) throw new Error('invalid guild id')
            await internal.sendGroupForwardMsg(guildId, nodes)
        } else {
            if (typeof internal?.sendPrivateForwardMsg !== 'function') throw new Error('no forward api')
            const userId = toOneBotNumber(session.userId)
            if (userId == null) throw new Error('invalid user id')
            await internal.sendPrivateForwardMsg(userId, nodes)
        }
    } catch {
        // 降级：分段纯文本
        for (const g of groups) {
            try { await session.send(g.join('\n')) } catch { /* 单段失败也忽略 */ }
        }
    }
}

/** 兼容地调用 delete_friend（先位置参数，后对象参数） */
async function deleteFriendCompat(session: Session, userId: string): Promise<void> {
    const internal = asOneBotBot(session.bot).internal
    if (typeof internal?.deleteFriend !== 'function') {
        throw new Error('当前适配器不支持 delete_friend 接口')
    }
    const n = toOneBotNumber(userId)
    if (n == null) throw new Error('输入格式错误，请输入要删除的好友 QQ 号。')
    try {
        await internal.deleteFriend(n)
    } catch {
        // 部分实现需要对象参数（user_id / friend_id）
        await internal.deleteFriend({ user_id: n, friend_id: n, temp_block: false, both_del: false })
    }
}

export function apply(ctx: Context, config: Config) {
    const cmdOpts = getAdminCommandOptions(config)
    const logger = createLogger(ctx, SCOPE, config)

    // 注册主指令
    ctx.command('gc', '群控管理员指令', cmdOpts)

    // ── 黑名单命令 ──────────────────────────────────────────────
    ctx.command('gc.ban <groupId:text>', '添加群聊到黑名单', cmdOpts)
        .action(async ({ session }, input) => {
            if (!session) return ''
            if (!hasGlobalPermission(session, config)) return '权限不足，只有全局管理员可以执行此操作。'
            const errorMsg = isBlacklistEnabled(config.basic); if (errorMsg) return errorMsg
            const guildId = parseGuildId(input); if (!guildId) return '输入格式错误。'
            const existing = await getBlacklistedGuild(ctx, guildId)
            if (existing.length > 0) return `群聊 ${guildId} 已在黑名单中。`
            await createBlacklistedGuild(ctx, guildId, 'manual_add')
            return `已添加群聊 ${guildId} 到黑名单。`
        })

    ctx.command('gc.unban <groupId:text>', '从黑名单移除群聊', cmdOpts)
        .action(async ({ session }, input) => {
            if (!session) return ''
            if (!hasGlobalPermission(session, config)) return '权限不足，只有全局管理员可以执行此操作。'
            const errorMsg = isBlacklistEnabled(config.basic); if (errorMsg) return errorMsg
            const guildId = parseGuildId(input); if (!guildId) return '输入格式错误。'
            const removed = await removeBlacklistedGuild(ctx, guildId)
            // 同时清理可能残留的主动退群标记，保证 unban 后新踢能正常检测
            await clearSelfLeft(ctx, guildId)
            return removed ? `已移除群聊 ${guildId}` : `群聊 ${guildId} 不在黑名单中。`
        })

    ctx.command('gc.banlist', '查看黑名单', cmdOpts)
        .action(async ({ session }) => {
            if (!session) return ''
            if (!hasGlobalPermission(session, config)) return '权限不足，只有全局管理员可以执行此操作。'
            const errorMsg = isBlacklistEnabled(config.basic); if (errorMsg) return errorMsg
            const records = await getAllBlacklistedGuilds(ctx)
            if (records.length === 0) return '黑名单为空。'
            return '黑名单列表：\n' + records.map(r => `- ${r.guildId} (时间: ${formatDate(r.timestamp)})`).join('\n')
        })

    ctx.command('gc.clearban', '清空黑名单', cmdOpts)
        .action(async ({ session }) => {
            if (!session) return ''
            if (!hasGlobalPermission(session, config)) return '权限不足，只有全局管理员可以执行此操作。'
            const errorMsg = isBlacklistEnabled(config.basic); if (errorMsg) return errorMsg
            const records = await getAllBlacklistedGuilds(ctx)
            if (records.length === 0) return '黑名单已是空的。'
            await clearBlacklistedGuilds(ctx)
            return `已清空黑名单，共移除 ${records.length} 个群聊。`
        })

    // ── 小群白名单命令 ──────────────────────────────────────────
    ctx.command('gc.sg-add <groupId:text>', '解除指定群聊的小群人数限制', cmdOpts)
        .action(async ({ session }, input) => {
            if (!session) return ''
            if (!hasGlobalPermission(session, config)) return '权限不足，只有全局管理员可以执行此操作。'
            const guildId = parseGuildId(input)
            if (!guildId) return '输入格式错误，请输入群号。'
            const exists = await isInSmallGroupWhitelist(ctx, guildId)
            if (exists) return `群聊 ${guildId} 已在小群白名单中。`
            await addToSmallGroupWhitelist(ctx, guildId)
            return `已将群聊 ${guildId} 加入小群白名单，该群不再受小群人数限制。`
        })

    ctx.command('gc.sg-rm <groupId:text>', '恢复指定群聊的小群人数限制', cmdOpts)
        .action(async ({ session }, input) => {
            if (!session) return ''
            if (!hasGlobalPermission(session, config)) return '权限不足，只有全局管理员可以执行此操作。'
            const guildId = parseGuildId(input)
            if (!guildId) return '输入格式错误，请输入群号。'
            const exists = await isInSmallGroupWhitelist(ctx, guildId)
            if (!exists) return `群聊 ${guildId} 不在小群白名单中。`
            await removeFromSmallGroupWhitelist(ctx, guildId)
            return `已将群聊 ${guildId} 从小群白名单移除，该群将恢复小群人数限制。`
        })

    ctx.command('gc.sg-list', '查看小群白名单', cmdOpts)
        .action(async ({ session }) => {
            if (!session) return ''
            if (!hasGlobalPermission(session, config)) return '权限不足，只有全局管理员可以执行此操作。'
            const records = await getAllSmallGroupWhitelist(ctx)
            if (records.length === 0) return '小群白名单为空。'
            return '小群白名单列表（以下群不受小群人数限制）：\n' + records.map(r => `- ${r.guildId}`).join('\n')
        })

    // ======== 好友 / 群管理 ========

    // 列出好友（合并转发）
    ctx.command('gc.friends', '列出机器人的好友（合并转发）', cmdOpts)
        .action(async ({ session }) => {
            if (!session) return ''
            if (!hasGlobalPermission(session, config)) return '权限不足，只有全局管理员可以执行此操作。'
            let list: OneBotFriend[] = []
            try {
                const raw = await asOneBotBot(session.bot).internal.getFriendList()
                list = Array.isArray(raw)
                    ? raw
                    : (Array.isArray((raw as { data?: OneBotFriend[] } | null)?.data)
                        ? (raw as { data: OneBotFriend[] }).data
                        : [])
            } catch (err) {
                return `获取好友列表失败：${errorMessage(err)}`
            }
            if (list.length === 0) return '好友列表为空。'
            const lines = list.map((f, i) => {
                const uid = f.user_id ?? f.userId ?? ''
                const name = f.remark || f.nickname || f.nick || String(uid)
                return `${i + 1}. ${name} (${uid})`
            })
            await sendAsForward(session, `好友列表（共 ${list.length} 个）`, lines)
            return ''
        })

    // 删除好友
    ctx.command('gc.delfriend <userId:text>', '删除指定好友', cmdOpts)
        .action(async ({ session }, input) => {
            if (!session) return ''
            if (!hasGlobalPermission(session, config)) return '权限不足，只有全局管理员可以执行此操作。'
            const userId = parseGuildId(input)
            if (!userId) return '输入格式错误，请输入要删除的好友 QQ 号。'
            try {
                await deleteFriendCompat(session, userId)
                return `已删除好友 ${userId}。`
            } catch (err) {
                return `删除好友失败：${errorMessage(err)}`
            }
        })

    // 列出所在群（合并转发）
    ctx.command('gc.groups', '列出机器人所在的群（合并转发）', cmdOpts)
        .action(async ({ session }) => {
            if (!session) return ''
            if (!hasGlobalPermission(session, config)) return '权限不足，只有全局管理员可以执行此操作。'
            let list: OneBotGroupInfo[] = []
            try {
                const raw = await asOneBotBot(session.bot).internal.getGroupList()
                list = Array.isArray(raw)
                    ? raw
                    : (Array.isArray((raw as { data?: OneBotGroupInfo[] } | null)?.data)
                        ? (raw as { data: OneBotGroupInfo[] }).data
                        : [])
            } catch (err) {
                return `获取群列表失败：${errorMessage(err)}`
            }
            if (list.length === 0) return '机器人尚未加入任何群。'
            const lines = list.map((g, i) => {
                const gid = g.group_id ?? g.groupId ?? ''
                const gname = g.group_name ?? g.groupName ?? String(gid)
                const count = g.member_count ?? g.memberCount
                const max = g.max_member_count ?? g.maxMemberCount
                const sizeInfo = (count != null) ? `（${count}${max != null ? `/${max}` : ''}人）` : ''
                return `${i + 1}. ${gname} (${gid})${sizeInfo}`
            })
            await sendAsForward(session, `群列表（共 ${list.length} 个）`, lines)
            return ''
        })

    // 退出指定群
    ctx.command('gc.leave <groupId:text>', '让机器人退出指定群', cmdOpts)
        .action(async ({ session }, input) => {
            if (!session) return ''
            if (!hasGlobalPermission(session, config)) return '权限不足，只有全局管理员可以执行此操作。'
            const guildId = parseGuildId(input)
            if (!guildId) return '输入格式错误，请输入要退出的群号。'
            const bot = asOneBotBot(session.bot)
            const selfId = getBotSelfId(bot)
            if (!selfId) return '无法识别当前机器人账号，已取消退群。'
            // 持久标记主动退群，避免 guild-removed 误判为被踢而拉黑
            await markSelfLeft(ctx, guildId, selfId)
            try {
                const groupId = toOneBotNumber(guildId)
                if (groupId == null) throw new Error('无效群号')
                await bot.internal.setGroupLeave(groupId)
                return `已退出群 ${guildId}。`
            } catch (err) {
                await clearSelfLeft(ctx, guildId, selfId)
                logger.warn(`退出群 ${guildId} 失败`, err)
                return `退出群 ${guildId} 失败：${errorMessage(err)}`
            }
        })

    // ======== 调试：OneBot 接口测试（仅调试模式可用）========
    // 用于排查小群「排除官方机器人」检测为何失效：直接调用 OneBot internal 接口，
    // 把原始返回打印出来，跟手测 API 的结果对照，定位 is_robot 字段缺失/失真的根因。
    // 仅当 logging.verbose（调试模式）开启时注册，避免误用与信息泄露。
    if (isVerbose(config)) {
        const debugCmd = ctx.command('gc.debug <action:string> [arg1:text]', '调试：测试 OneBot 接口返回（仅调试模式）', cmdOpts)
            .action(async ({ session }, action, arg1) => {
                if (!session) return ''
                if (!hasGlobalPermission(session, config)) return '权限不足。'
                if (!action) return '用法：\n  gc.debug member-list <群号>\n  gc.debug member <群号> <QQ>\n  gc.debug raw <群号>'
                const bot = asOneBotBot(session.bot)

                if (action === 'member-list') {
                    const groupId = toOneBotNumber(arg1)
                    if (groupId == null) return '请指定有效的群号。用法：gc.debug member-list <群号>'
                    return await debugMemberList(bot, groupId)
                }

                if (action === 'member') {
                    const parts = String(arg1 ?? '').split(/\s+/).filter(Boolean)
                    const groupId = toOneBotNumber(parts[0])
                    const userId = toOneBotNumber(parts[1])
                    if (groupId == null || userId == null) return '用法：gc.debug member <群号> <QQ>'
                    return await debugMember(bot, groupId, userId)
                }

                if (action === 'raw') {
                    const groupId = toOneBotNumber(arg1)
                    if (groupId == null) return '请指定有效的群号。用法：gc.debug raw <群号>'
                    return await debugRawMemberList(bot, groupId, session)
                }

                return `未知子指令：${action}。可用：member-list / member / raw`
            })
        void debugCmd
    }
}

/** debug member-list：对比 no_cache=true 与不传 no_cache 两次调用的 is_robot 分布 */
async function debugMemberList(bot: ReturnType<typeof asOneBotBot>, groupId: number): Promise<string> {
    const lines: string[] = [`[member-list] group=${groupId}`]
    for (const [label, noCache] of [['no_cache=true', true], ['no_cache=false', false]] as const) {
        try {
            const raw = await bot.internal?.getGroupMemberList?.(groupId, noCache)
            const list = Array.isArray(raw) ? raw : ((raw as { data?: unknown[] } | null)?.data ?? [])
            const members = list as OneBotMember[]
            const robots = members.filter(m => (m as { is_robot?: unknown }).is_robot === true).length
            const first5 = members.slice(0, 5).map(m => {
                const uid = m.user_id ?? m.userId ?? '?'
                const name = m.nickname ?? m.card ?? ''
                return `${uid}(${name}) is_robot=${JSON.stringify((m as { is_robot?: unknown }).is_robot)}`
            })
            lines.push(`\n== ${label} ==`)
            lines.push(`总数=${members.length} is_robot=true 数=${robots}`)
            lines.push('前5个成员：')
            lines.push(...first5.map(s => '  ' + s))
        } catch (err) {
            lines.push(`\n== ${label} == 调用失败：${errorMessage(err)}`)
        }
    }
    return lines.join('\n')
}

/** debug member：单个成员的完整原始字段（带 no_cache） */
async function debugMember(bot: ReturnType<typeof asOneBotBot>, groupId: number, userId: number): Promise<string> {
    try {
        const member = await bot.internal?.getGroupMemberInfo?.(groupId, userId, true)
        return `[member] group=${groupId} user=${userId}\n${JSON.stringify(member, null, 2)}`
    } catch (err) {
        return `调用失败：${errorMessage(err)}`
    }
}

/** debug raw：原始成员列表前若干项的完整 JSON（合并转发，避免单条过长） */
async function debugRawMemberList(bot: ReturnType<typeof asOneBotBot>, groupId: number, session: Session): Promise<string> {
    try {
        const raw = await bot.internal?.getGroupMemberList?.(groupId, true)
        const list = Array.isArray(raw) ? raw : ((raw as { data?: unknown[] } | null)?.data ?? [])
        const members = list as OneBotMember[]
        const lines = [
            `[raw] group=${groupId} 共 ${members.length} 个成员（仅展示前 10 个的完整字段）`,
            ...members.slice(0, 10).map((m, i) => `--- #${i} ---\n${JSON.stringify(m, null, 2)}`),
        ]
        // 单条消息可能超长，走合并转发；失败则降级分段
        await sendAsForward(session, `debug raw group=${groupId}`, lines)
        return ''
    } catch (err) {
        return `调用失败：${errorMessage(err)}`
    }
}
