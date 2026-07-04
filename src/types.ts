import { Bot, Command, Session } from 'koishi'
import { parseGuildId } from './utils-id'

/**
 * 声明非标准事件，使 ctx.on(...) 无需 as any：
 *   - guild-member/ban：由 koishi-plugin-adapter-onebot 在 bot 被禁言时派发。
 *   - help/command：由 koishi help 插件在渲染指令详情时派发，参数为 (output, command, session)。
 */
declare module '@satorijs/core' {
    interface Events {
        'guild-member/ban'(session: Session): void
        'help/command'(output: string[], command: Command, session: Session): void
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

/** OneBot 群成员信息（get_group_member_list 返回项 / get_group_member_info）。
 *  兼容 koishi GuildMember 形态：roles 为 [{ id }]（decodeGuildMember 产出）。 */
export interface OneBotMember {
    user_id?: number | string
    nickname?: string
    card?: string
    role?: 'owner' | 'admin' | 'member'
    is_robot?: boolean
    userId?: number | string
    user?: {
        id?: number | string
    }
    sender?: {
        role?: string
    }
    roles?: { id: string }[]
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

/** OneBot internal API 子集（仅声明本插件用到的方法）。
 *
 * 返回类型按 koishi adapter-onebot 的实际行为声明：其 Internal._get 直接返回
 * response.data（已解包），故这里都是裸对象/数组，不再兼容 `{ data: ... }` 包裹。 */
export interface OneBotInternal {
    setGroupLeave(groupId: number | string): Promise<unknown>
    getGroupInfo(groupId: number | string): Promise<OneBotGroupInfo>
    getGroupMemberList(groupId: number | string, noCache?: boolean): Promise<OneBotMember[]>
    getGroupMemberInfo(groupId: number | string, userId: number | string, noCache?: boolean): Promise<OneBotMember>
    getStrangerInfo(userId: number | string): Promise<OneBotStrangerInfo>
    setFriendAddRequest(flag: string, approve: boolean, remark?: string): Promise<unknown>
    setGroupAddRequest(flag: string, type: 'add' | 'invite', approve: boolean, reason?: string): Promise<unknown>
    sendGroupForwardMsg?(groupId: number | string, messages: OneBotForwardNode[]): Promise<unknown>
    sendPrivateForwardMsg?(userId: number | string, messages: OneBotForwardNode[]): Promise<unknown>
    getFriendList(): Promise<OneBotFriend[]>
    getGroupList(): Promise<OneBotGroupInfo[]>
    deleteFriend?(arg: number | { user_id: number; friend_id?: number; temp_block?: boolean; both_del?: boolean }): Promise<unknown>
}

/**
 * 带底层 _get 通道的 OneBotInternal 视图。
 *
 * adapter-onebot 的 Internal 用 `_get(action, params)` 作为底层请求通道：所有标准方法
 * （getGroupInfo 等）都是经 Internal.define 动态挂到 prototype 上、内部调用 _get 实现的。
 * 因此非标准接口（如 get_robot_uin_range）没有对应的封装方法，必须直接调 _get。
 *
 * _get 在 adapter 类型里被标为 private，但运行时确实存在于 internal 原型上，
 * 这里通过接口声明重新暴露（与本项目「收敛 OneBot 私有形状」的既有思路一致）。
 * HTTP 方法（GET/POST）由 adapter 的 _request 统一处理，调用方无需关心。
 */
export interface OneBotInternalRaw extends OneBotInternal {
    _get(action: string, params?: Record<string, unknown>): Promise<unknown>
}

/**
 * koishi `Bot` 在 OneBot 协议下的窄化视图。
 *
 * 注意：koishi 的 Bot 类声明了 `internal: any`，而 `any & T` 在 TS 里仍是 any，
 * 所以这里的 `internal` 在类型层面仍会被当成 any——这是 koishi 类型 + 本仓库 monorepo
 * 重复依赖（cordis/minato 双副本）的共同限制，无法用 Omit 安全覆盖（会触发
 * Bot<koishi Context> 与 Bot<cordis Context> 的结构比较冲突）。
 * 因此 internal 的精确形状靠 OneBotInternal 接口文档化 + 调用点按需 `as` 断言保证。
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
 * OneBot 适配器收到事件后调用 session.setInternal('onebot', data)，
 * 原始 payload 即挂在 session.event._data 上——这是唯一的挂载点。
 */
export function getRawEvent(session: Session): OneBotRawEvent {
    return (session.event as { _data?: OneBotRawEvent } | undefined)?._data ?? {}
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
