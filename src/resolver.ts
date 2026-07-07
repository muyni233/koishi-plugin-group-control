import { Context, Session } from 'koishi'
import { getQuotedText, parseQuotedTarget, parseTargetArg, type ResolvedTarget, type TargetDomain } from './utils'
import { asOneBotBot, getBotSelfId, OneBotFriend, OneBotGroupInfo } from './types'
import {
    getPendingInvite, getPendingFriendRequest, getAllPendingInvites, getAllPendingFriendRequests,
    getBlacklistedGuild, getBlacklistedFriend,
} from './database'

export type ResolveResult = { ok: true, target: ResolvedTarget } | { ok: false, message: string }
type TargetDetection = ResolvedTarget | null | 'ambiguous'

function targetFromDomains(id: string, domains: Set<TargetDomain>): TargetDetection {
    if (domains.size > 1) return 'ambiguous'
    const [domain] = domains
    return domain ? { domain, id } : null
}

function ambiguousTargetMessage(id: string, detail = '同时匹配群聊和好友'): string {
    return `号码 ${id} ${detail}，请加前缀区分：group:${id}（群）/ friend:${id}（好友）。`
}

async function collectPendingDomains(ctx: Context, session: Session, selfId: string, id: string, domains: Set<TargetDomain>): Promise<void> {
    if (await getPendingInvite(ctx, session.platform, id, selfId)) domains.add('group')
    if (await getPendingFriendRequest(ctx, session.platform, selfId, id)) domains.add('friend')
}

async function detectPendingTarget(ctx: Context, session: Session, selfId: string, id: string): Promise<TargetDetection> {
    const domains = new Set<TargetDomain>()
    await collectPendingDomains(ctx, session, selfId, id, domains)
    return targetFromDomains(id, domains)
}

async function detectKnownTarget(ctx: Context, session: Session, id: string): Promise<TargetDetection> {
    const domains = new Set<TargetDomain>()
    const selfId = getBotSelfId(session.bot)

    if (selfId) await collectPendingDomains(ctx, session, selfId, id, domains)
    if ((await getBlacklistedGuild(ctx, id)).length > 0) domains.add('group')
    if (await getBlacklistedFriend(ctx, id)) domains.add('friend')

    const bot = asOneBotBot(session.bot)
    try {
        const groups = await bot.internal.getGroupList() as OneBotGroupInfo[]
        if (groups.some(g => String(g.group_id ?? g.groupId ?? '') === id)) domains.add('group')
    } catch { /* ignore unavailable list api */ }
    try {
        const friends = await bot.internal.getFriendList() as OneBotFriend[]
        if (friends.some(f => String(f.user_id ?? f.userId ?? '') === id)) domains.add('friend')
    } catch { /* ignore unavailable list api */ }

    return targetFromDomains(id, domains)
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
            const detected = await detectPendingTarget(ctx, session, selfId, id)
            if (detected === 'ambiguous') {
                return { ok: false, message: ambiguousTargetMessage(id, '同时存在待处理群邀请和好友申请') }
            }
            if (detected) return { ok: true, target: detected }
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

/** ban/unban 目标：合法参数 > 引用通知；裸号按现有状态识别，无法识别时兼容为群。 */
export async function resolveBanTarget(ctx: Context, session: Session, arg: string | undefined): Promise<ResolveResult> {
    if (arg) {
        const p = parseTargetArg(arg)
        if (p) {
            if ('domain' in p) return { ok: true, target: p }
            const detected = await detectKnownTarget(ctx, session, p.bare)
            if (detected === 'ambiguous') {
                return { ok: false, message: ambiguousTargetMessage(p.bare) }
            }
            if (detected) return { ok: true, target: detected }
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
