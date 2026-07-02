import { Context, Session } from 'koishi'
import { getQuotedText, parseQuotedTarget, parseTargetArg, type ResolvedTarget } from './utils'
import { asOneBotBot, getBotSelfId, OneBotFriend, OneBotGroupInfo } from './types'
import {
    getPendingInvite, getPendingFriendRequest, getAllPendingInvites, getAllPendingFriendRequests,
} from './database'

export type ResolveResult = { ok: true, target: ResolvedTarget } | { ok: false, message: string }

/** 号码是否为当前好友 */
async function isFriend(session: Session, userId: string): Promise<boolean> {
    try {
        const list = await asOneBotBot(session.bot).internal.getFriendList() as OneBotFriend[]
        return list.some(f => String(f.user_id ?? f.userId ?? '') === userId)
    } catch { return false }
}

/** 号码是否为机器人所在群 */
async function isInGroup(session: Session, groupId: string): Promise<boolean> {
    try {
        const list = await asOneBotBot(session.bot).internal.getGroupList() as OneBotGroupInfo[]
        return list.some(g => String(g.group_id ?? g.groupId ?? '') === groupId)
    } catch { return false }
}

/**
 * approve/reject 目标：合法参数 > 引用通知 > 单条自动选用。
 * 参数非法时不立刻报错——回复时 arg 可能带上被引用文本，需要落到引用解析。
 */
export async function resolvePendingTarget(ctx: Context, session: Session, arg: string | undefined): Promise<ResolveResult> {
    const selfId = getBotSelfId(session.bot)
    if (!selfId) return { ok: false, message: '无法识别当前机器人账号，已取消操作。' }

    if (arg) {
        const p = parseTargetArg(arg)
        if (p) {
            if ('domain' in p) return { ok: true, target: p }
            const id = p.bare
            const gi = await getPendingInvite(ctx, session.platform, id, selfId)
            const fr = await getPendingFriendRequest(ctx, session.platform, selfId, id)
            if (gi && fr) {
                return { ok: false, message: `号码 ${id} 同时存在待处理群邀请和好友申请，请加前缀区分：group:${id}（群）/ friend:${id}（好友）。` }
            }
            if (gi) return { ok: true, target: { domain: 'group', id } }
            if (fr) return { ok: true, target: { domain: 'friend', id } }
            return { ok: false, message: `未找到号码 ${id} 的待处理请求。使用 gc.pending 查看待处理列表。` }
        }
        // 参数不是合法号码（可能是回复带上的被引用文本）→ 落到引用解析
    }

    const q = parseQuotedTarget(getQuotedText(session))
    if (q) return { ok: true, target: q }

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

/** ban/unban 目标：合法参数 > 引用通知；裸号默认按群。 */
export async function resolveBanTarget(session: Session, arg: string | undefined): Promise<ResolveResult> {
    if (arg) {
        const p = parseTargetArg(arg)
        if (p) {
            if ('domain' in p) return { ok: true, target: p }
            return { ok: true, target: { domain: 'group', id: p.bare } }
        }
    }
    const q = parseQuotedTarget(getQuotedText(session))
    if (q) return { ok: true, target: q }
    return { ok: false, message: '请指定群号/QQ号，或引用对应的通知消息。' }
}

/**
 * del 目标：合法参数（裸号自动识别好友/所在群，两者都是则询问）> 引用通知。
 * 规则：只匹配到好友→删好友；只匹配到所在群→退群；两者都匹配→提示加前缀；都没匹配→提示加前缀。
 */
export async function resolveDelTarget(session: Session, arg: string | undefined): Promise<ResolveResult> {
    if (arg) {
        const p = parseTargetArg(arg)
        if (p) {
            if ('domain' in p) return { ok: true, target: p }
            const id = p.bare
            const friend = await isFriend(session, id)
            const group = await isInGroup(session, id)
            if (friend && group) {
                return { ok: false, message: `号码 ${id} 同时是你的好友和你所在的群，请加前缀区分：group:${id}（退群）/ friend:${id}（删好友）。` }
            }
            if (friend) return { ok: true, target: { domain: 'friend', id } }
            if (group) return { ok: true, target: { domain: 'group', id } }
            return { ok: false, message: `号码 ${id} 既不是你的好友，也不在你所在的群，请加前缀 group:${id} 或 friend:${id} 明确。` }
        }
    }
    const q = parseQuotedTarget(getQuotedText(session))
    if (q) return { ok: true, target: q }
    return { ok: false, message: '请指定群号/QQ号，或引用对应的通知消息。' }
}
