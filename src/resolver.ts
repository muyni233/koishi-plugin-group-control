import { Context, Session } from 'koishi'
import { getQuotedText, parseQuotedTarget, parseTargetArg, type ResolvedTarget, type TargetDomain } from './utils'
import { getBotSelfId } from './types'
import {
    getPendingInvite, getPendingFriendRequest, getAllPendingInvites, getAllPendingFriendRequests,
} from './database'

export type ResolveResult = { ok: true, target: ResolvedTarget } | { ok: false, message: string }

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
 * 域固定指令（gc.leave/gc.sg-add/gc.sg-rm 处理群，gc.del 处理好友）目标解析：
 * 合法参数（裸号按 domain 处理）> 引用通知（域须匹配，跨域给出明确提示）。
 * 与 approve/reject/ban/unban 的区别：不自动识别域——这些指令的域由指令本身决定。
 */
export function resolveFixedTarget(session: Session, arg: string | undefined, domain: TargetDomain): ResolveResult {
    if (arg) {
        const p = parseTargetArg(arg)
        if (p) {
            if ('domain' in p) {
                if (p.domain !== domain) {
                    const want = domain === 'group' ? '群聊' : '好友'
                    return { ok: false, message: `该指令仅处理${want}，请使用 ${domain}:${p.id}。` }
                }
                return { ok: true, target: p }
            }
            return { ok: true, target: { domain, id: p.bare } }
        }
        // 参数不是合法号码（可能是回复带上的被引用文本）→ 落到引用解析
    }
    const q = parseQuotedTarget(getQuotedText(session))
    if (q) {
        if (q.domain !== domain) {
            const quoted = q.domain === 'group' ? '群聊' : '好友'
            const want = domain === 'group' ? '群聊' : '好友'
            return { ok: false, message: `引用的通知是${quoted}，但本指令仅处理${want}。` }
        }
        return { ok: true, target: q }
    }
    const label = domain === 'group' ? '群号' : 'QQ号'
    return { ok: false, message: `请指定${label}，或引用对应的通知消息。` }
}
