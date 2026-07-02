import { Context, Session } from 'koishi'
import { Config } from '../config'
import {
    isBlacklistEnabled, getAdminCommandOptions, hasAdminPermission,
    getQuotedText, parseQuotedTarget, parseTargetArg,
    type ResolvedTarget, type TargetDomain,
} from '../utils'
import { parseGuildId, toOneBotNumber, formatDate } from '../utils-id'
import { asOneBotBot, getBotSelfId, OneBotBot, OneBotForwardNode, OneBotFriend, OneBotGroupInfo, OneBotMember } from '../types'
import { createLogger, errorMessage, isVerbose } from '../logger'
import { handleInviteRequest } from './invite'
import {
    getAllBlacklistedGuilds, getBlacklistedGuild, createBlacklistedGuild, clearBlacklistedGuilds, removeBlacklistedGuild,
    getAllBlacklistedFriends, createBlacklistedFriend, removeBlacklistedFriend,
    addToSmallGroupWhitelist, removeFromSmallGroupWhitelist, getAllSmallGroupWhitelist, isInSmallGroupWhitelist,
    clearSelfLeft, markSelfLeft, markApprovedGuild,
    getPendingInvite, removePendingInvite, getAllPendingInvites,
    getPendingFriendRequest, removePendingFriendRequest, getAllPendingFriendRequests,
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
            if (typeof internal.sendGroupForwardMsg !== 'function') throw new Error('no forward api')
            const guildId = toOneBotNumber(session.guildId)
            if (guildId == null) throw new Error('invalid guild id')
            await internal.sendGroupForwardMsg(guildId, nodes)
        } else {
            if (typeof internal.sendPrivateForwardMsg !== 'function') throw new Error('no forward api')
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
    if (typeof internal.deleteFriend !== 'function') {
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

// ── 目标解析 ──────────────────────────────────────────────

type ResolveResult = { ok: true, target: ResolvedTarget } | { ok: false, message: string }

/**
 * 解析 approve/reject 的目标（必须是待处理请求）。
 * 优先级：参数（前缀强制域 / 裸号自动识别）> 引用通知 > 无参单条自动选用。
 * 裸号同时命中群邀请与好友申请时返回提示，要求加前缀 group:/friend:。
 */
async function resolvePendingTarget(ctx: Context, session: Session, arg: string | undefined, forceDomain?: TargetDomain): Promise<ResolveResult> {
    const selfId = getBotSelfId(session.bot)
    if (!selfId) return { ok: false, message: '无法识别当前机器人账号，已取消操作。' }

    if (arg) {
        const p = parseTargetArg(arg)
        if (!p) return { ok: false, message: '输入格式错误，请输入群号/QQ号，或引用对应通知消息。' }
        if ('domain' in p) return { ok: true, target: p }
        // 裸号
        const id = p.bare
        if (forceDomain) return { ok: true, target: { domain: forceDomain, id } }
        const gi = await getPendingInvite(ctx, session.platform, id, selfId)
        const fr = await getPendingFriendRequest(ctx, session.platform, selfId, id)
        if (gi && fr) {
            return { ok: false, message: `号码 ${id} 同时存在待处理群邀请和好友申请，请加前缀区分：group:${id}（群）/ friend:${id}（好友）。` }
        }
        if (gi) return { ok: true, target: { domain: 'group', id } }
        if (fr) return { ok: true, target: { domain: 'friend', id } }
        return { ok: false, message: `未找到号码 ${id} 的待处理请求。使用 gc.pending 查看待处理列表。` }
    }

    // 无参数：先看引用
    const q = parseQuotedTarget(getQuotedText(session))
    if (q) return { ok: true, target: q }

    // 无参无引用：恰好一条时自动选用
    const invites = await getAllPendingInvites(ctx, session.platform, selfId)
    const friends = await getAllPendingFriendRequests(ctx, session.platform, selfId)
    const total = invites.length + friends.length
    if (total === 0) return { ok: false, message: '当前没有待处理的请求。' }
    if (total === 1) {
        return invites.length === 1
            ? { ok: true, target: { domain: 'group', id: invites[0].groupId } }
            : { ok: true, target: { domain: 'friend', id: friends[0].userId } }
    }
    return { ok: false, message: `当前有 ${total} 条待处理请求，请指定号码或引用对应通知；使用 gc.pending 查看列表。` }
}

/**
 * 解析 ban/unban 的目标。优先级：参数 > 引用通知；裸号默认按群处理
 * （保留历史 gc.ban 语义，避免裸号误删好友；好友用 friend: 前缀或引用好友申请）。
 */
function resolveBanUnbanTarget(session: Session, arg: string | undefined, forceDomain?: TargetDomain): ResolveResult {
    if (arg) {
        const p = parseTargetArg(arg)
        if (!p) return { ok: false, message: '输入格式错误，请输入群号/QQ号，或引用对应通知消息。' }
        if ('domain' in p) return { ok: true, target: p }
        return { ok: true, target: { domain: forceDomain ?? 'group', id: p.bare } }
    }
    const q = parseQuotedTarget(getQuotedText(session))
    if (q) return { ok: true, target: q }
    return { ok: false, message: '请指定群号/QQ号，或引用对应的通知消息。' }
}

// ── 统一动作 ──────────────────────────────────────────────

/** 同意待处理请求（群邀请 / 好友申请） */
async function doApprove(ctx: Context, config: Config, session: Session, arg: string | undefined, forceDomain?: TargetDomain): Promise<string> {
    if (!hasAdminPermission(session, config)) return '权限不足，只有管理员可以审核请求。'
    const r = await resolvePendingTarget(ctx, session, arg, forceDomain)
    if (!r.ok) return r.message
    const bot = asOneBotBot(session.bot)
    const selfId = getBotSelfId(bot)
    if (!selfId) return '无法识别当前机器人账号，已取消操作。'

    if (r.target.domain === 'group') {
        const groupId = r.target.id
        if (config.basic.enableBlacklist) {
            const bl = await getBlacklistedGuild(ctx, groupId)
            if (bl.length > 0) return `群 ${groupId} 在黑名单中，无法通过审核。如需放行请先执行 gc.unban ${groupId}。`
        }
        const inviteData = await getPendingInvite(ctx, session.platform, groupId, selfId)
        if (!inviteData) return `未找到群号 ${groupId} 的待处理邀请。使用 gc.pending 查看列表。`
        try {
            await handleInviteRequest(bot, inviteData.flag, true)
            await markApprovedGuild(ctx, groupId, selfId)
            try { await bot.sendPrivateMessage(inviteData.userId, '您的群聊邀请已通过管理员审核，机器人已加入群聊。') } catch { /* 通知失败忽略 */ }
            await removePendingInvite(ctx, session.platform, groupId, selfId)
            return `已同意加入群 ${groupId}（${inviteData.groupName}），邀请者：${inviteData.userName}`
        } catch (err) {
            return `处理同意邀请失败: ${errorMessage(err)}`
        }
    }

    // friend
    const userId = r.target.id
    const record = await getPendingFriendRequest(ctx, session.platform, selfId, userId)
    if (!record) return `未找到来自 ${userId} 的待处理好友申请。`
    try {
        await bot.internal.setFriendAddRequest(record.flag, true, '')
        await removePendingFriendRequest(ctx, session.platform, selfId, userId)
        return `已同意 ${record.nickname}（${userId}）的好友申请。`
    } catch (err) {
        return `处理失败：${errorMessage(err)}`
    }
}

/** 拒绝待处理请求（群邀请 / 好友申请） */
async function doReject(ctx: Context, config: Config, session: Session, arg: string | undefined, forceDomain?: TargetDomain): Promise<string> {
    if (!hasAdminPermission(session, config)) return '权限不足，只有管理员可以审核请求。'
    const r = await resolvePendingTarget(ctx, session, arg, forceDomain)
    if (!r.ok) return r.message
    const bot = asOneBotBot(session.bot)
    const selfId = getBotSelfId(bot)
    if (!selfId) return '无法识别当前机器人账号，已取消操作。'

    if (r.target.domain === 'group') {
        const groupId = r.target.id
        const inviteData = await getPendingInvite(ctx, session.platform, groupId, selfId)
        if (!inviteData) return `未找到群号 ${groupId} 的待处理邀请。使用 gc.pending 查看列表。`
        try {
            await handleInviteRequest(bot, inviteData.flag, false, '已拒绝')
            try { await bot.sendPrivateMessage(inviteData.userId, '您的群聊邀请未通过管理员审核，机器人将不会加入该群聊。') } catch { /* 通知失败忽略 */ }
            await removePendingInvite(ctx, session.platform, groupId, selfId)
            return `已拒绝加入群 ${groupId}（${inviteData.groupName}），邀请者：${inviteData.userName}`
        } catch (err) {
            return `处理拒绝邀请失败: ${errorMessage(err)}`
        }
    }

    const userId = r.target.id
    const record = await getPendingFriendRequest(ctx, session.platform, selfId, userId)
    if (!record) return `未找到来自 ${userId} 的待处理好友申请。`
    try {
        await bot.internal.setFriendAddRequest(record.flag, false, '')
        await removePendingFriendRequest(ctx, session.platform, selfId, userId)
        return `已拒绝 ${record.nickname}（${userId}）的好友申请。`
    } catch (err) {
        return `处理失败：${errorMessage(err)}`
    }
}

/** 拉黑（群黑名单 / 好友黑名单） */
async function doBan(ctx: Context, config: Config, session: Session, arg: string | undefined, forceDomain?: TargetDomain): Promise<string> {
    if (!hasAdminPermission(session, config)) return '权限不足，只有管理员可以执行此操作。'
    const r = resolveBanUnbanTarget(session, arg, forceDomain)
    if (!r.ok) return r.message
    const id = r.target.id

    if (r.target.domain === 'group') {
        const errorMsg = isBlacklistEnabled(config.basic); if (errorMsg) return errorMsg
        const existing = await getBlacklistedGuild(ctx, id)
        if (existing.length > 0) return `群聊 ${id} 已在黑名单中。`
        await createBlacklistedGuild(ctx, id, 'manual_add')
        return `已添加群聊 ${id} 到黑名单。`
    }

    // 好友：写入黑名单 + best-effort 拒绝待处理申请、删除已是好友的
    await createBlacklistedFriend(ctx, id, 'manual_add')
    const notes: string[] = []
    const selfId = getBotSelfId(session.bot)
    if (selfId) {
        const rec = await getPendingFriendRequest(ctx, session.platform, selfId, id)
        if (rec) {
            try { await asOneBotBot(session.bot).internal.setFriendAddRequest(rec.flag, false, '已拉黑') } catch { /* 忽略 */ }
            await removePendingFriendRequest(ctx, session.platform, selfId, id)
            notes.push('已拒绝待处理申请')
        }
    }
    try {
        await deleteFriendCompat(session, id)
        notes.push('已删除好友')
    } catch { /* 非好友或适配器不支持，忽略 */ }
    return notes.length > 0 ? `已拉黑好友 ${id}（${notes.join('、')}）。` : `已拉黑好友 ${id}。`
}

/** 解除黑名单（群 / 好友） */
async function doUnban(ctx: Context, config: Config, session: Session, arg: string | undefined, forceDomain?: TargetDomain): Promise<string> {
    if (!hasAdminPermission(session, config)) return '权限不足，只有管理员可以执行此操作。'
    const r = resolveBanUnbanTarget(session, arg, forceDomain)
    if (!r.ok) return r.message
    const id = r.target.id

    if (r.target.domain === 'group') {
        const removed = await removeBlacklistedGuild(ctx, id)
        await clearSelfLeft(ctx, id)
        return removed ? `已移除群聊 ${id} 的黑名单。` : `群聊 ${id} 不在黑名单中。`
    }

    const removed = await removeBlacklistedFriend(ctx, id)
    return removed ? `已移除好友 ${id} 的黑名单。` : `好友 ${id} 不在黑名单中。`
}

export function apply(ctx: Context, config: Config) {
    const cmdOpts = getAdminCommandOptions(config)
    const logger = createLogger(ctx, SCOPE, config)

    // 注册主指令
    ctx.command('gc', '群控管理员指令', cmdOpts)

    // ======== 统一审核：approve / reject / pending ========

    ctx.command('gc.approve [target:string]', '同意待处理请求（群邀请/好友申请，可引用通知或加前缀 group:/friend:）', cmdOpts)
        .action(async ({ session }, target) => {
            if (!session) return ''
            return doApprove(ctx, config, session, target)
        })

    ctx.command('gc.reject [target:string]', '拒绝待处理请求（群邀请/好友申请，可引用通知或加前缀 group:/friend:）', cmdOpts)
        .action(async ({ session }, target) => {
            if (!session) return ''
            return doReject(ctx, config, session, target)
        })

    ctx.command('gc.pending', '查看待处理请求（群邀请 + 好友申请，合并转发）', cmdOpts)
        .action(async ({ session }) => {
            if (!session) return ''
            if (!hasAdminPermission(session, config)) return '权限不足，只有管理员可以查看待处理请求。'
            const selfId = getBotSelfId(asOneBotBot(session.bot))
            if (!selfId) return '无法识别当前机器人账号，已取消操作。'
            const invites = await getAllPendingInvites(ctx, session.platform, selfId)
            const friends = await getAllPendingFriendRequests(ctx, session.platform, selfId)
            if (invites.length === 0 && friends.length === 0) return '当前没有待处理的请求。'

            const lines: string[] = []
            if (invites.length > 0) {
                lines.push(`【待处理群邀请 · ${invites.length}】`)
                invites.forEach((iv, i) => {
                    const elapsed = Math.floor((Date.now() / 1000 - iv.time) / 60)
                    lines.push(`${i + 1}. ${iv.groupName}（${iv.groupId}）`)
                    lines.push(`   邀请者：${iv.userName}（${iv.userId}）· ${elapsed} 分钟前`)
                })
                lines.push('')
            }
            if (friends.length > 0) {
                lines.push(`【待处理好友申请 · ${friends.length}】`)
                friends.forEach((fr, i) => {
                    const elapsed = Math.floor((Date.now() / 1000 - fr.time) / 60)
                    lines.push(`${i + 1}. ${fr.nickname}（${fr.userId}）附言：${fr.comment || '无'} · ${elapsed} 分钟前`)
                })
                lines.push('')
            }
            lines.push('用法：gc.approve/gc.reject [号码]，或直接引用本通知即可。')
            await sendAsForward(session, `待处理请求（群邀请 ${invites.length} · 好友申请 ${friends.length}）`, lines)
            return ''
        })

    // ======== 黑名单：ban / unban / banlist / clearban ========

    ctx.command('gc.ban [target:string]', '拉黑群聊/好友（可引用通知；裸号默认群，好友用 friend: 前缀）', cmdOpts)
        .action(async ({ session }, target) => {
            if (!session) return ''
            return doBan(ctx, config, session, target)
        })

    ctx.command('gc.unban [target:string]', '解除群聊/好友黑名单（可引用「已自动拒绝黑名单群邀请」通知）', cmdOpts)
        .action(async ({ session }, target) => {
            if (!session) return ''
            return doUnban(ctx, config, session, target)
        })

    ctx.command('gc.banlist', '查看黑名单（群 + 好友，合并转发）', cmdOpts)
        .action(async ({ session }) => {
            if (!session) return ''
            if (!hasAdminPermission(session, config)) return '权限不足，只有管理员可以执行此操作。'
            const groups = await getAllBlacklistedGuilds(ctx)
            const friends = await getAllBlacklistedFriends(ctx)
            if (groups.length === 0 && friends.length === 0) return '黑名单为空。'

            const lines: string[] = []
            lines.push(`【群黑名单 · ${groups.length}】`)
            if (groups.length === 0) lines.push('（无）')
            groups.forEach((r, i) => lines.push(`${i + 1}. ${r.guildId}（${r.reason}，${formatDate(r.timestamp)}）`))
            lines.push('')
            lines.push(`【好友黑名单 · ${friends.length}】`)
            if (friends.length === 0) lines.push('（无）')
            friends.forEach((r, i) => lines.push(`${i + 1}. ${r.userId}（${r.reason}，${formatDate(r.timestamp)}）`))
            await sendAsForward(session, `黑名单（群 ${groups.length} · 好友 ${friends.length}）`, lines)
            return ''
        })

    ctx.command('gc.clearban', '清空群黑名单', cmdOpts)
        .action(async ({ session }) => {
            if (!session) return ''
            if (!hasAdminPermission(session, config)) return '权限不足，只有管理员可以执行此操作。'
            const errorMsg = isBlacklistEnabled(config.basic); if (errorMsg) return errorMsg
            const records = await getAllBlacklistedGuilds(ctx)
            if (records.length === 0) return '群黑名单已是空的。'
            await clearBlacklistedGuilds(ctx)
            return `已清空群黑名单，共移除 ${records.length} 个群聊。`
        })

    // ── 小群白名单命令 ──────────────────────────────────────────
    ctx.command('gc.sg-add <groupId:text>', '解除指定群聊的小群人数限制', cmdOpts)
        .action(async ({ session }, input) => {
            if (!session) return ''
            if (!hasAdminPermission(session, config)) return '权限不足，只有管理员可以执行此操作。'
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
            if (!hasAdminPermission(session, config)) return '权限不足，只有管理员可以执行此操作。'
            const guildId = parseGuildId(input)
            if (!guildId) return '输入格式错误，请输入群号。'
            const exists = await isInSmallGroupWhitelist(ctx, guildId)
            if (!exists) return `群聊 ${guildId} 不在小群白名单中。`
            await removeFromSmallGroupWhitelist(ctx, guildId)
            return `已将群聊 ${guildId} 从小群白名单移除，该群将恢复小群人数限制。`
        })

    ctx.command('gc.sg-list', '查看小群白名单（合并转发）', cmdOpts)
        .action(async ({ session }) => {
            if (!session) return ''
            if (!hasAdminPermission(session, config)) return '权限不足，只有管理员可以执行此操作。'
            const records = await getAllSmallGroupWhitelist(ctx)
            if (records.length === 0) return '小群白名单为空。'
            const lines = records.map((r, i) => `${i + 1}. ${r.guildId}`)
            await sendAsForward(session, `小群白名单（共 ${records.length} 个）`, lines)
            return ''
        })

    // ======== 好友 / 群管理 ========

    // 列出好友（合并转发）
    ctx.command('gc.friends', '列出机器人的好友（合并转发）', cmdOpts)
        .action(async ({ session }) => {
            if (!session) return ''
            if (!hasAdminPermission(session, config)) return '权限不足，只有管理员可以执行此操作。'
            let list: OneBotFriend[] = []
            try {
                list = await asOneBotBot(session.bot).internal.getFriendList() as OneBotFriend[]
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
    ctx.command('gc.delfriend <userId:text>', '删除指定好友（不拉黑）', cmdOpts)
        .action(async ({ session }, input) => {
            if (!session) return ''
            if (!hasAdminPermission(session, config)) return '权限不足，只有管理员可以执行此操作。'
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
            if (!hasAdminPermission(session, config)) return '权限不足，只有管理员可以执行此操作。'
            let list: OneBotGroupInfo[] = []
            try {
                list = await asOneBotBot(session.bot).internal.getGroupList() as OneBotGroupInfo[]
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
            if (!hasAdminPermission(session, config)) return '权限不足，只有管理员可以执行此操作。'
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
        ctx.command('gc.debug', '调试：OneBot 接口测试（仅调试模式）', cmdOpts)

        // 对比 no_cache=true 与不传 no_cache 两次 getGroupMemberList 的 is_robot 分布
        ctx.command('gc.debug.member-list <groupId:text>', '对比成员列表接口的 is_robot 分布', cmdOpts)
            .action(async ({ session }, input) => {
                if (!session) return ''
                if (!hasAdminPermission(session, config)) return '权限不足。'
                const groupId = toOneBotNumber(input)
                if (groupId == null) return '请输入有效的群号。'
                return await debugMemberList(asOneBotBot(session.bot), groupId)
            })

        // 单个成员的完整原始字段（带 no_cache）
        ctx.command('gc.debug.member <groupId:text> <userId:text>', '查看单个成员的完整原始字段', cmdOpts)
            .action(async ({ session }, groupIdInput, userIdInput) => {
                if (!session) return ''
                if (!hasAdminPermission(session, config)) return '权限不足。'
                const groupId = toOneBotNumber(groupIdInput)
                const userId = toOneBotNumber(userIdInput)
                if (groupId == null || userId == null) return '请输入有效的群号和 QQ 号。'
                return await debugMember(asOneBotBot(session.bot), groupId, userId)
            })

        // 原始成员列表前若干项的完整 JSON（合并转发，避免单条过长）
        ctx.command('gc.debug.raw <groupId:text>', '查看成员列表原始 JSON（合并转发）', cmdOpts)
            .action(async ({ session }, input) => {
                if (!session) return ''
                if (!hasAdminPermission(session, config)) return '权限不足。'
                const groupId = toOneBotNumber(input)
                if (groupId == null) return '请输入有效的群号。'
                return await debugRawMemberList(asOneBotBot(session.bot), groupId, session)
            })
    }
}

/** debug member-list：对比 no_cache=true 与不传 no_cache 两次调用的 is_robot 分布 */
async function debugMemberList(bot: ReturnType<typeof asOneBotBot>, groupId: number): Promise<string> {
    const lines: string[] = [`[member-list] group=${groupId}`]
    for (const [label, noCache] of [['no_cache=true', true], ['no_cache=false', false]] as const) {
        try {
            const members = await bot.internal.getGroupMemberList(groupId, noCache) as OneBotMember[]
            const robots = members.filter(m => m.is_robot === true).length
            const first5 = members.slice(0, 5).map(m => {
                const uid = m.user_id ?? m.userId ?? '?'
                const name = m.nickname ?? m.card ?? ''
                return `${uid}(${name}) is_robot=${JSON.stringify(m.is_robot)}`
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
        const member = await bot.internal.getGroupMemberInfo(groupId, userId, true)
        return `[member] group=${groupId} user=${userId}\n${JSON.stringify(member, null, 2)}`
    } catch (err) {
        return `调用失败：${errorMessage(err)}`
    }
}

/** debug raw：原始成员列表前若干项的完整 JSON（合并转发，避免单条过长） */
async function debugRawMemberList(bot: ReturnType<typeof asOneBotBot>, groupId: number, session: Session): Promise<string> {
    try {
        const members = await bot.internal.getGroupMemberList(groupId, true) as OneBotMember[]
        const lines = [
            `[raw] group=${groupId} 共 ${members.length} 个成员（仅展示前 10 个的完整字段）`,
            ...members.slice(0, 10).map((m, i) => `--- #${i} ---\n${JSON.stringify(m, null, 2)}`),
        ]
        await sendAsForward(session, `debug raw group=${groupId}`, lines)
        return ''
    } catch (err) {
        return `调用失败：${errorMessage(err)}`
    }
}
