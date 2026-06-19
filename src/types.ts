import { Bot, Session } from 'koishi'
import { parseGuildId } from './utils-id'

/**
 * 声明 OneBot 适配器扩展的非标准事件，使 ctx.on('guild-member-mute', ...) 无需 as any。
 * 该事件由 koishi-plugin-adapter-onebot 在 bot 被禁言时派发，satori 标准 Events 里没有。
 */
declare module '@satorijs/core' {
    interface Events {
        'guild-member-mute'(session: Session): void
    }
}

/**
 * 收敛 OneBot 协议特有的类型扩展。
 *
 * koishi 标准 Bot 类型的 `internal` 是 `any`，事件原始数据也只通过 `session.event._data` 等
 * 非标准字段透传。本文件给这些 OneBot 私有形状起最小本地接口，
 * 模块里就不再写 `(bot as any).internal` / `(session as any).original` 了。
 *
 * 命名风格：保持 OneBot 原始字段（snake_case）+ koishi 后置规范（camelCase）双字段，
 * 兼容不同 OneBot 实现（NapCat / LLOneBot / Lagrange / go-cqhttp 等）。
 */

/** OneBot 群成员信息（get_group_member_list 返回项 / get_group_member_info） */
export interface OneBotMember {
    user_id?: number | string
    nickname?: string
    card?: string
    role?: 'owner' | 'admin' | 'member'
    is_robot?: boolean
    // 部分非主流实现使用的字段名
    userId?: number | string
    isRobot?: boolean
    user?: {
        id?: number | string
        isBot?: boolean
    }
    sender?: {
        role?: string
    }
    // role 的备选字段（不同适配器命名差异，保留宽松）
    memberRole?: string
    permissions?: string
    roles?: string[]
    roleIds?: string[]
}

/** OneBot 群信息（get_group_info） */
export interface OneBotGroupInfo {
    group_id?: number | string
    group_name?: string
    member_count?: number
    max_member_count?: number
    // 兼容 camelCase 实现
    groupId?: number | string
    groupName?: string
    memberCount?: number
    maxMemberCount?: number
}

/** OneBot 好友信息（get_friend_list 返回项） */
export interface OneBotFriend {
    user_id?: number | string
    nickname?: string
    nick?: string
    remark?: string
    userId?: number | string
}

/** OneBot 陌生人信息（get_stranger_info） */
export interface OneBotStrangerInfo {
    user_id?: number | string
    nickname?: string
}

/** OneBot 合并转发节点 */
export interface OneBotForwardNode {
    type: 'node'
    data: {
        user_id: string | number
        nickname: string
        content: string
    }
}

/** OneBot internal API 子集（仅声明本插件用到的方法） */
export interface OneBotInternal {
    setGroupLeave(groupId: number | string): Promise<unknown>
    getGroupInfo(groupId: number | string): Promise<OneBotGroupInfo | { data?: OneBotGroupInfo } | null>
    getGroupMemberList(
        groupId: number | string,
        noCache?: boolean,
    ): Promise<OneBotMember[] | { data?: OneBotMember[] } | null>
    getGroupMemberInfo(
        groupId: number | string,
        userId: number | string,
        noCache?: boolean,
    ): Promise<OneBotMember | null>
    getStrangerInfo(userId: number | string): Promise<OneBotStrangerInfo | null>
    setFriendAddRequest(flag: string, approve: boolean, remark?: string): Promise<unknown>
    setGroupAddRequest(flag: string, type: 'add' | 'invite', approve: boolean, reason?: string): Promise<unknown>
    sendGroupForwardMsg(groupId: number | string, messages: OneBotForwardNode[]): Promise<unknown>
    sendPrivateForwardMsg(userId: number | string, messages: OneBotForwardNode[]): Promise<unknown>
    getFriendList(): Promise<OneBotFriend[] | { data?: OneBotFriend[] } | null>
    getGroupList(): Promise<OneBotGroupInfo[] | { data?: OneBotGroupInfo[] } | null>
    deleteFriend(arg: number | { user_id: number; friend_id?: number; temp_block?: boolean; both_del?: boolean }): Promise<unknown>
}

/**
 * koishi `Bot` 在 OneBot 协议下的窄化视图。`internal` 在 koishi 类型里是 any，
 * 这里替换为本文件定义的 OneBotInternal，使所有 internal 调用获得类型检查。
 */
export type OneBotBot = Bot & { internal: OneBotInternal }

/** 把 koishi 的 session.bot 转成 OneBot 视图（仅做类型断言，不做运行时校验） */
export function asOneBotBot(bot: Bot): OneBotBot {
    return bot as OneBotBot
}

/** OneBot group_increase / group_decrease 等事件的原始字段 */
export interface OneBotRawEvent {
    sub_type?: string
    flag?: string
    user_id?: number | string
    group_id?: number | string
    operator_id?: number | string
    time?: number
    comment?: string
    duration?: number
    [key: string]: unknown
}

/**
 * 从 koishi Session 中提取 OneBot 原始事件数据。
 *
 * koishi 不在公共类型里暴露原始事件，但 satori event 一般会把它放在 `_data` 上，
 * 老版本 / 备用路径还可能在 session.original / session.onebot。
 * 这里统一兜底，调用方拿到的就是 OneBotRawEvent，再从中读 sub_type / flag / user_id 等。
 */
export function getRawEvent(session: Session): OneBotRawEvent {
    const event = session.event as { _data?: OneBotRawEvent } | undefined
    const fromData = event?._data
    if (fromData) return fromData
    const sessionAny = session as unknown as { original?: OneBotRawEvent; raw?: OneBotRawEvent; onebot?: OneBotRawEvent }
    return sessionAny.original ?? sessionAny.raw ?? sessionAny.onebot ?? {}
}

/** 取 bot 的纯数字 selfId（剥掉 platform: 前缀）。无法识别返回 null。 */
export function getBotSelfId(bot: Bot | undefined | null): string | null {
    if (!bot) return null
    const raw = String(bot.selfId ?? bot.userId ?? '')
    return parseGuildId(raw)
}

/** 取群成员的纯数字 user id（兼容 OneBot 原始字段与 koishi 标准字段） */
export function getMemberUserId(m: OneBotMember | null | undefined): string {
    if (!m) return ''
    const raw = m.user_id ?? m.userId ?? m.user?.id
    if (raw == null) return ''
    return parseGuildId(String(raw)) ?? String(raw)
}

/** 判定一个群成员是否应被视为「机器人」：QQ 官方机器人 (is_robot) 或 bot 自身 */
export function isBotMember(m: OneBotMember | null | undefined, selfId: string | null): boolean {
    if (!m) return false
    if (selfId && getMemberUserId(m) === selfId) return true
    if (m.is_robot === true) return true
    if (m.isRobot === true) return true
    if (m.user?.isBot === true) return true
    return false
}
