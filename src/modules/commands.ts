import { Context, Session } from 'koishi'
import { Config } from '../config'
import {
    isBlacklistEnabled, getAdminCommandOptions, hasAdminPermission, escapeTpl,
} from '../utils'
import { toOneBotNumber, formatDate } from '../utils-id'
import { asOneBotBot, getBotSelfId, OneBotBot, OneBotForwardNode, OneBotFriend, OneBotGroupInfo, OneBotMember } from '../types'
import { createLogger, errorMessage, isVerbose } from '../logger'
import { handleInviteRequest } from './invite'
import { resolvePendingTarget, resolveBanTarget, resolveFixedTarget } from '../resolver'
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

/** 以合并转发形式发送；适配器不支持时降级为分段纯文本。 */
async function sendAsForward(session: Session, title: string, lines: string[]): Promise<void> {
    const groups = chunk(lines, 80)
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
        for (const g of groups) {
            try { await session.send(g.join('\n')) } catch { /* 忽略 */ }
        }
    }
}

/**
 * 兼容地调用 delete_friend：先试位置参数（新签名），失败再试对象参数（旧签名）。
 * 两次都失败时，重抛第二次的错误，并把第一次的错误作为 cause 保留，
 * 便于定位是适配器不支持位置参数、还是 delete_friend 本身失败。
 */
async function deleteFriendCompat(session: Session, userId: string): Promise<void> {
    const internal = asOneBotBot(session.bot).internal
    if (typeof internal.deleteFriend !== 'function') {
        throw new Error('当前适配器不支持 delete_friend 接口')
    }
    const n = toOneBotNumber(userId)
    if (n == null) throw new Error('输入格式错误，请输入要删除的好友 QQ 号。')
    try {
        await internal.deleteFriend(n)
    } catch (firstErr) {
        try {
            await internal.deleteFriend({ user_id: n, friend_id: n, temp_block: false, both_del: false })
        } catch (secondErr) {
            // 两次都失败：以第二次的错误为表面信息抛出，第一次的链入 cause 便于排查适配器差异
            throw new Error(`位置参数与对象参数均失败：${errorMessage(secondErr)}`, { cause: firstErr })
        }
    }
}

/** bot 是否仍在指定群内 */
async function isBotInGroup(bot: OneBotBot, guildId: string): Promise<boolean> {
    try {
        const list = await bot.internal.getGroupList() as OneBotGroupInfo[]
        return list.some(g => String(g.group_id ?? g.groupId ?? '') === guildId)
    } catch {
        return false
    }
}

// ── 统一动作 ──────────────────────────────────────────────

async function doApprove(ctx: Context, config: Config, session: Session, arg: string | undefined): Promise<string> {
    if (!hasAdminPermission(session, config)) return '权限不足。'
    const r = await resolvePendingTarget(ctx, session, arg)
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
            try { await bot.sendPrivateMessage(inviteData.userId, '您的群聊邀请已通过管理员审核，机器人已加入群聊。') } catch { /* 忽略 */ }
            await removePendingInvite(ctx, session.platform, groupId, selfId)
            return `已同意加入群 ${groupId}（${inviteData.groupName}），邀请者：${inviteData.userName}`
        } catch (err) {
            return `处理同意邀请失败: ${errorMessage(err)}`
        }
    }

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

async function doReject(ctx: Context, config: Config, session: Session, arg: string | undefined): Promise<string> {
    if (!hasAdminPermission(session, config)) return '权限不足。'
    const r = await resolvePendingTarget(ctx, session, arg)
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
            try { await bot.sendPrivateMessage(inviteData.userId, '您的群聊邀请未通过管理员审核，机器人将不会加入该群聊。') } catch { /* 忽略 */ }
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

async function doBan(ctx: Context, config: Config, session: Session, arg: string | undefined): Promise<string> {
    if (!hasAdminPermission(session, config)) return '权限不足。'
    const r = await resolveBanTarget(session, arg)
    if (!r.ok) return r.message
    const id = r.target.id
    const bot = asOneBotBot(session.bot)

    if (r.target.domain === 'group') {
        const errorMsg = isBlacklistEnabled(config.basic); if (errorMsg) return errorMsg
        const existing = await getBlacklistedGuild(ctx, id)
        if (existing.length > 0) return `群聊 ${id} 已在黑名单中。`
        await createBlacklistedGuild(ctx, id, 'manual_add')

        const selfId = getBotSelfId(bot)
        let note = ''
        if (selfId && await isBotInGroup(bot, id)) {
            try { await bot.sendMessage(id, config.basic.blacklistMessage, session.platform) } catch { /* 群内提示失败忽略 */ }
            await markSelfLeft(ctx, id, selfId)
            try {
                const gid = toOneBotNumber(id)
                if (gid == null) throw new Error('无效群号')
                await bot.internal.setGroupLeave(gid)
                note = '，机器人已退出该群'
            } catch (err) {
                await clearSelfLeft(ctx, id, selfId)
                note = `（退出失败：${errorMessage(err)}）`
            }
        }
        return `已添加群聊 ${id} 到黑名单${note}。`
    }

    await createBlacklistedFriend(ctx, id, 'manual_add')
    const notes: string[] = []
    const selfId = getBotSelfId(bot)
    if (selfId) {
        const rec = await getPendingFriendRequest(ctx, session.platform, selfId, id)
        if (rec) {
            try { await bot.internal.setFriendAddRequest(rec.flag, false, '已拉黑') } catch { /* 忽略 */ }
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

async function doUnban(ctx: Context, config: Config, session: Session, arg: string | undefined): Promise<string> {
    if (!hasAdminPermission(session, config)) return '权限不足。'
    const r = await resolveBanTarget(session, arg)
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

    ctx.command('gc', '群控管理员指令', cmdOpts)

    // 审核
    ctx.command('gc.approve [target:string]', '同意请求', cmdOpts)
        .action(async ({ session }, target) => { if (!session) return ''; return doApprove(ctx, config, session, target) })
    ctx.command('gc.reject [target:string]', '拒绝请求', cmdOpts)
        .action(async ({ session }, target) => { if (!session) return ''; return doReject(ctx, config, session, target) })
    ctx.command('gc.pending', '查看待处理请求', cmdOpts)
        .action(async ({ session }) => {
            if (!session) return ''
            if (!hasAdminPermission(session, config)) return '权限不足。'
            const selfId = getBotSelfId(asOneBotBot(session.bot))
            if (!selfId) return '无法识别当前机器人账号，已取消操作。'
            const invites = await getAllPendingInvites(ctx, session.platform, selfId)
            const friends = await getAllPendingFriendRequests(ctx, session.platform, selfId)
            if (invites.length === 0 && friends.length === 0) return '当前没有待处理的请求。'
            const lines: string[] = []
            if (invites.length > 0) {
                lines.push(`【待处理群邀请 · ${invites.length}】`)
                invites.forEach((iv, i) => {
                    lines.push(escapeTpl(
                        `${i + 1}. {groupName}（${iv.groupId}）· 邀请者 {userName}（${iv.userId}）`,
                        { groupName: iv.groupName, userName: iv.userName },
                    ))
                })
            }
            if (friends.length > 0) {
                lines.push(`【待处理好友申请 · ${friends.length}】`)
                friends.forEach((fr, i) => {
                    const comment = fr.comment || '无'
                    lines.push(escapeTpl(
                        `${i + 1}. {nickname}（${fr.userId}）· 附言：{comment}`,
                        { nickname: fr.nickname, comment },
                    ))
                })
            }
            await sendAsForward(session, `待处理请求（群邀请 ${invites.length} · 好友申请 ${friends.length}）`, lines)
            return ''
        })

    // 黑名单
    ctx.command('gc.ban [target:string]', '拉黑群聊/好友', cmdOpts)
        .action(async ({ session }, target) => { if (!session) return ''; return doBan(ctx, config, session, target) })
    ctx.command('gc.unban [target:string]', '解除黑名单', cmdOpts)
        .action(async ({ session }, target) => { if (!session) return ''; return doUnban(ctx, config, session, target) })
    ctx.command('gc.banlist', '查看黑名单', cmdOpts)
        .action(async ({ session }) => {
            if (!session) return ''
            if (!hasAdminPermission(session, config)) return '权限不足。'
            const groups = await getAllBlacklistedGuilds(ctx)
            const friends = await getAllBlacklistedFriends(ctx)
            if (groups.length === 0 && friends.length === 0) return '黑名单为空。'
            const lines: string[] = []
            lines.push(`【群黑名单 · ${groups.length}】`)
            if (groups.length === 0) lines.push('（无）')
            groups.forEach((r, i) => lines.push(`${i + 1}. ${r.guildId}（${r.reason}，${formatDate(r.timestamp)}）`))
            lines.push(`【好友黑名单 · ${friends.length}】`)
            if (friends.length === 0) lines.push('（无）')
            friends.forEach((r, i) => lines.push(`${i + 1}. ${r.userId}（${r.reason}，${formatDate(r.timestamp)}）`))
            await sendAsForward(session, `黑名单（群 ${groups.length} · 好友 ${friends.length}）`, lines)
            return ''
        })
    ctx.command('gc.clearban', '清空群黑名单', cmdOpts)
        .action(async ({ session }) => {
            if (!session) return ''
            if (!hasAdminPermission(session, config)) return '权限不足。'
            const errorMsg = isBlacklistEnabled(config.basic); if (errorMsg) return errorMsg
            const records = await getAllBlacklistedGuilds(ctx)
            if (records.length === 0) return '群黑名单已是空的。'
            await clearBlacklistedGuilds(ctx)
            return `已清空群黑名单，共移除 ${records.length} 个群聊。`
        })

    // 小群白名单
    ctx.command('gc.sg-add [target:string]', '解除小群人数限制', cmdOpts)
        .action(async ({ session }, target) => {
            if (!session) return ''
            if (!hasAdminPermission(session, config)) return '权限不足。'
            const r = resolveFixedTarget(session, target, 'group')
            if (!r.ok) return r.message
            const guildId = r.target.id
            const exists = await isInSmallGroupWhitelist(ctx, guildId)
            if (exists) return `群聊 ${guildId} 已在小群白名单中。`
            await addToSmallGroupWhitelist(ctx, guildId)
            return `已将群聊 ${guildId} 加入小群白名单。`
        })
    ctx.command('gc.sg-rm [target:string]', '恢复小群人数限制', cmdOpts)
        .action(async ({ session }, target) => {
            if (!session) return ''
            if (!hasAdminPermission(session, config)) return '权限不足。'
            const r = resolveFixedTarget(session, target, 'group')
            if (!r.ok) return r.message
            const guildId = r.target.id
            const exists = await isInSmallGroupWhitelist(ctx, guildId)
            if (!exists) return `群聊 ${guildId} 不在小群白名单中。`
            await removeFromSmallGroupWhitelist(ctx, guildId)
            return `已将群聊 ${guildId} 从小群白名单移除。`
        })
    ctx.command('gc.sg-list', '查看小群白名单', cmdOpts)
        .action(async ({ session }) => {
            if (!session) return ''
            if (!hasAdminPermission(session, config)) return '权限不足。'
            const records = await getAllSmallGroupWhitelist(ctx)
            if (records.length === 0) return '小群白名单为空。'
            await sendAsForward(session, `小群白名单（共 ${records.length} 个）`, records.map((r, i) => `${i + 1}. ${r.guildId}`))
            return ''
        })

    // 好友 / 群
    ctx.command('gc.friends', '查看好友列表', cmdOpts)
        .action(async ({ session }) => {
            if (!session) return ''
            if (!hasAdminPermission(session, config)) return '权限不足。'
            let list: OneBotFriend[] = []
            try {
                list = await asOneBotBot(session.bot).internal.getFriendList() as OneBotFriend[]
            } catch (err) {
                return `获取好友列表失败：${errorMessage(err)}`
            }
            if (list.length === 0) return '好友列表为空。'
            await sendAsForward(session, `好友列表（共 ${list.length} 个）`, list.map((f, i) => {
                const uid = f.user_id ?? f.userId ?? ''
                const name = f.remark || f.nickname || f.nick || String(uid)
                return escapeTpl(`${i + 1}. {name} (${uid})`, { name })
            }))
            return ''
        })
    ctx.command('gc.del [target:string]', '删除好友', cmdOpts)
        .action(async ({ session }, target) => {
            if (!session) return ''
            if (!hasAdminPermission(session, config)) return '权限不足。'
            const r = resolveFixedTarget(session, target, 'friend')
            if (!r.ok) return r.message
            const userId = r.target.id
            try {
                await deleteFriendCompat(session, userId)
                return `已删除好友 ${userId}。`
            } catch (err) {
                return `删除好友失败：${errorMessage(err)}`
            }
        })
    ctx.command('gc.leave [target:string]', '退出指定群', cmdOpts)
        .action(async ({ session }, target) => {
            if (!session) return ''
            if (!hasAdminPermission(session, config)) return '权限不足。'
            const r = resolveFixedTarget(session, target, 'group')
            if (!r.ok) return r.message
            const guildId = r.target.id
            const bot = asOneBotBot(session.bot)
            const selfId = getBotSelfId(bot)
            if (!selfId) return '无法识别当前机器人账号，已取消退群。'
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
    ctx.command('gc.groups', '查看群列表', cmdOpts)
        .action(async ({ session }) => {
            if (!session) return ''
            if (!hasAdminPermission(session, config)) return '权限不足。'
            let list: OneBotGroupInfo[] = []
            try {
                list = await asOneBotBot(session.bot).internal.getGroupList() as OneBotGroupInfo[]
            } catch (err) {
                return `获取群列表失败：${errorMessage(err)}`
            }
            if (list.length === 0) return '机器人尚未加入任何群。'
            await sendAsForward(session, `群列表（共 ${list.length} 个）`, list.map((g, i) => {
                const gid = g.group_id ?? g.groupId ?? ''
                const gname = g.group_name ?? g.groupName ?? String(gid)
                const count = g.member_count ?? g.memberCount
                const max = g.max_member_count ?? g.maxMemberCount
                const sizeInfo = (count != null) ? `（${count}${max != null ? `/${max}` : ''}人）` : ''
                return escapeTpl(`${i + 1}. {gname} (${gid})${sizeInfo}`, { gname })
            }))
            return ''
        })

    // 调试（仅调试模式）
    if (isVerbose(config)) {
        ctx.command('gc.debug', 'OneBot 接口测试（调试）', cmdOpts)
        ctx.command('gc.debug.member-list <groupId:text>', '成员列表 is_robot 分布', cmdOpts)
            .action(async ({ session }, input) => {
                if (!session) return ''
                if (!hasAdminPermission(session, config)) return '权限不足。'
                const groupId = toOneBotNumber(input)
                if (groupId == null) return '请输入有效的群号。'
                return await debugMemberList(asOneBotBot(session.bot), groupId)
            })
        ctx.command('gc.debug.member <groupId:text> <userId:text>', '单个成员原始字段', cmdOpts)
            .action(async ({ session }, groupIdInput, userIdInput) => {
                if (!session) return ''
                if (!hasAdminPermission(session, config)) return '权限不足。'
                const groupId = toOneBotNumber(groupIdInput)
                const userId = toOneBotNumber(userIdInput)
                if (groupId == null || userId == null) return '请输入有效的群号和 QQ 号。'
                return await debugMember(asOneBotBot(session.bot), groupId, userId)
            })
        ctx.command('gc.debug.raw <groupId:text>', '成员列表原始 JSON', cmdOpts)
            .action(async ({ session }, input) => {
                if (!session) return ''
                if (!hasAdminPermission(session, config)) return '权限不足。'
                const groupId = toOneBotNumber(input)
                if (groupId == null) return '请输入有效的群号。'
                return await debugRawMemberList(asOneBotBot(session.bot), groupId, session)
            })
    }
}

async function debugMemberList(bot: ReturnType<typeof asOneBotBot>, groupId: number): Promise<string> {
    const lines: string[] = [`[member-list] group=${groupId}`]
    for (const [label, noCache] of [['no_cache=true', true], ['no_cache=false', false]] as const) {
        try {
            const members = await bot.internal.getGroupMemberList(groupId, noCache) as OneBotMember[]
            const robots = members.filter(m => m.is_robot === true).length
            lines.push(`\n== ${label} ==`)
            lines.push(`总数=${members.length} is_robot=true 数=${robots}`)
            lines.push(...members.slice(0, 5).map(m => `  ${m.user_id ?? m.userId ?? '?'}(${m.nickname ?? m.card ?? ''}) is_robot=${JSON.stringify(m.is_robot)}`))
        } catch (err) {
            lines.push(`\n== ${label} == 调用失败：${errorMessage(err)}`)
        }
    }
    return lines.join('\n')
}

async function debugMember(bot: ReturnType<typeof asOneBotBot>, groupId: number, userId: number): Promise<string> {
    try {
        const member = await bot.internal.getGroupMemberInfo(groupId, userId, true)
        return `[member] group=${groupId} user=${userId}\n${JSON.stringify(member, null, 2)}`
    } catch (err) {
        return `调用失败：${errorMessage(err)}`
    }
}

async function debugRawMemberList(bot: ReturnType<typeof asOneBotBot>, groupId: number, session: Session): Promise<string> {
    try {
        const members = await bot.internal.getGroupMemberList(groupId, true) as OneBotMember[]
        const lines = [
            `[raw] group=${groupId} 共 ${members.length} 个成员（前 10 个）`,
            ...members.slice(0, 10).map((m, i) => `--- #${i} ---\n${JSON.stringify(m, null, 2)}`),
        ]
        await sendAsForward(session, `debug raw group=${groupId}`, lines)
        return ''
    } catch (err) {
        return `调用失败：${errorMessage(err)}`
    }
}
