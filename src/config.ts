import { Schema } from 'koishi'

export interface GroupConfig {
    welcomeMessage: string
    quitMessage: string
    quitCommandEnabled: boolean
    enableBlacklist: boolean
    blacklistMessage: string
    notifyAdminOnKick: boolean
    kickNotificationMessage: string
    smallGroupAutoQuit: boolean
    smallGroupThreshold: number
    smallGroupQuitMessage: string
    smallGroupNotifyAdmin: boolean
    smallGroupCheckDelay: number
    smallGroupQualifiedNotifyAdmin: boolean
    smallGroupQualifiedMessage: string
    notifyAdminOnMute: boolean
    muteNotificationMessage: string
}

export interface AdminConfig {
    adminQQs: string[]
    notificationGroupId: string
}

export interface GroupInviteConfig {
    enabled: boolean
    inviteWaitMessage: string
    inviteRequestMessage: string
    autoApprove: boolean
    showDetailedLog: boolean
    inviteExpireDays: number
}

export interface FrequencyConfig {
    enabled: boolean
    limit: number
    window: number
    warnDelay: number
    blockDur: number
    whitelist: string[]
    privateEnabled: boolean
    privateLimit: number
    privateWindow: number
    privateWarnDelay: number
    privateBlockDur: number
    privateWhitelist: string[]
    blockExpBase: number
    blockExpWindow: number
    blockNotifyCooldown: number
    warnMsg: string
    blockMsg: string
    blockedMsg: string
}

export interface FriendConfig {
    enabled: boolean
    autoApprove: boolean
    notifyAdminOnApprove: boolean
    requestExpireDays: number
    requestMessage: string
    approveNotificationMessage: string
}

export interface BotSwitchConfig {
    enabled: boolean
    defaultState: boolean
    disabledMessage: string
}

export interface PermissionConfig {
    mode: 'koishi' | 'builtin'
    koishiAuthority: number
    protectedCommands: string[]
}

export interface Config {
    admin: AdminConfig
    permission: PermissionConfig
    basic: GroupConfig
    invite: GroupInviteConfig
    friend: FriendConfig
    frequency: FrequencyConfig
    botSwitch: BotSwitchConfig
}

export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
        admin: Schema.object({
            adminQQs: Schema.array(String).default([]).description('管理员QQ号列表（权限验证及通知）'),
            notificationGroupId: Schema.string().description('通知群号（填写后发到此群，否则私聊管理员）'),
        }).description('管理员配置'),
    }),
    Schema.object({
        permission: Schema.object({
            mode: Schema.union([
                Schema.const('koishi').description('使用 Koishi 自带权限系统 (authority)'),
                Schema.const('builtin').description('使用插件内置权限管理 (群管理员/群主)'),
            ]).default('builtin').description('权限管理模式'),
            koishiAuthority: Schema.number().default(3).description('Koishi 模式下管理指令所需的最低权限等级'),
            protectedCommands: Schema.array(String).default([]).description('需要群管理员权限才能使用的自定义指令名列表'),
        }).description('权限管理'),
    }),
    Schema.object({
        basic: Schema.object({
            welcomeMessage: Schema.string().default('你好，我是机器人。').description('加入群聊时发送的欢迎消息'),
            quitCommandEnabled: Schema.boolean().default(true).description('启用 quit 指令'),
            quitMessage: Schema.string().default('收到来自{userId}的指令，即将退出群聊。').description('quit 指令触发后的群内提示，支持变量 {userId}'),
            enableBlacklist: Schema.boolean().default(true).description('启用被踢出自动拉黑'),
            blacklistMessage: Schema.string().default('此群聊已被拉黑，机器人将自动退出，请联系管理员移出黑名单。').description('被拉入黑名单群后的提示'),
            notifyAdminOnKick: Schema.boolean().default(true).description('被踢出群时通知管理员'),
            kickNotificationMessage: Schema.string().default('机器人已被踢出群聊\n群名称：{groupName}\n群号：{groupId}\n该群已被自动加入黑名单。').description('被踢出群通知模板，支持变量 {groupId}, {groupName}'),
            smallGroupAutoQuit: Schema.boolean().default(false).description('启用小群自动退群'),
            smallGroupThreshold: Schema.number().default(30).description('小群人数阈值（低于等于此值时自动退群）'),
            smallGroupCheckDelay: Schema.number().default(3000).description('加入后延迟检测时间（毫秒）'),
            smallGroupQuitMessage: Schema.string().default('该群人数过少（{memberCount}人），不满足最低人数要求（{threshold}人），机器人将自动退出。').description('小群退群提示，支持变量 {memberCount}, {threshold}, {groupName}, {groupId}'),
            smallGroupNotifyAdmin: Schema.boolean().default(true).description('小群自动退群时通知管理员'),
            smallGroupQualifiedNotifyAdmin: Schema.boolean().default(true).description('未经审核被拉入人数达标的群时通知管理员'),
            smallGroupQualifiedMessage: Schema.string().default('机器人被未经审核地拉入群聊\n群名称：{groupName}\n群号：{groupId}\n当前人数：{memberCount}人（阈值：{threshold}人）\n请确认是否保留。').description('合格小群通知模板，支持变量 {groupName}, {groupId}, {memberCount}, {threshold}'),
            notifyAdminOnMute: Schema.boolean().default(false).description('机器人被禁言时通知管理员'),
            muteNotificationMessage: Schema.string().default('机器人在群聊中被禁言\n群名称：{groupName}\n群号：{groupId}\n操作者：{operatorId}\n禁言时长：{duration}秒').description('被禁言通知模板，支持变量 {groupId}, {groupName}, {operatorId}, {duration}'),
        }).description('基础群组管理'),
    }),
    Schema.object({
        invite: Schema.object({
            enabled: Schema.boolean().default(false).description('启用群聊邀请审核'),
            autoApprove: Schema.boolean().default(false).description('自动同意邀请（仅在未指定管理员时生效）'),
            inviteWaitMessage: Schema.string().default('已收到您的群聊邀请，正在等待管理员审核，请耐心等待。').description('发给邀请者的等待提示'),
            inviteRequestMessage: Schema.string().default('收到新的群聊邀请请求：\n群名称：{groupName}\n群号：{groupId}\n邀请者：{userName} (QQ: {userId})\n\n请使用指令 gc.approve {groupId} 同意或 gc.reject {groupId} 拒绝。').description('发给管理员的请求消息模板，支持变量 {groupName}, {groupId}, {userName}, {userId}'),
            inviteExpireDays: Schema.number().default(3).description('邀请记录过期天数'),
            showDetailedLog: Schema.boolean().default(false).description('显示详细日志'),
        }).description('群聊邀请审核'),
    }),
    Schema.object({
        friend: Schema.object({
            enabled: Schema.boolean().default(false).description('启用好友申请管理'),
            autoApprove: Schema.boolean().default(false).description('自动通过好友申请（否则通知管理员手动处理）'),
            notifyAdminOnApprove: Schema.boolean().default(true).description('自动通过时是否仍通知管理员'),
            requestExpireDays: Schema.number().default(7).description('待处理申请的过期天数'),
            requestMessage: Schema.string().default('收到新的好友申请\nQQ：{userId}\n昵称：{nickname}\n附言：{comment}\n\n使用 gc.fa {userId} 同意或 gc.fr {userId} 拒绝。').description('通知管理员的消息模板，支持变量 {userId}, {nickname}, {comment}'),
            approveNotificationMessage: Schema.string().default('已自动通过好友申请\nQQ：{userId}\n昵称：{nickname}\n附言：{comment}').description('自动通过时的通知模板，支持变量 {userId}, {nickname}, {comment}'),
        }).description('好友申请管理'),
    }),
    Schema.object({
        frequency: Schema.object({
            enabled: Schema.boolean().default(false).description('启用群聊频率控制（指令及 @ 对话均受限）'),
            limit: Schema.number().default(5).description('群聊：时间窗口内允许的最大触发次数'),
            window: Schema.number().default(60).description('群聊：时间窗口（秒）'),
            warnDelay: Schema.number().default(30).description('群聊：警告后再次触发的时间阈值（秒），超出则进入屏蔽'),
            blockDur: Schema.number().default(300).description('群聊：首次屏蔽的基础时长（秒）'),
            whitelist: Schema.array(String).default([]).description('群聊：不受频率限制的群号列表'),
            privateEnabled: Schema.boolean().default(false).description('启用私聊频率控制'),
            privateLimit: Schema.number().default(10).description('私聊：时间窗口内允许的最大触发次数'),
            privateWindow: Schema.number().default(60).description('私聊：时间窗口（秒）'),
            privateWarnDelay: Schema.number().default(30).description('私聊：警告后再次触发的时间阈值（秒）'),
            privateBlockDur: Schema.number().default(300).description('私聊：首次屏蔽的基础时长（秒）'),
            privateWhitelist: Schema.array(String).default([]).description('私聊：不受频率限制的用户ID列表'),
            blockExpBase: Schema.number().default(2).description('屏蔽时长指数增长底数（时长 = blockDur × base^(次数-1)），设为 1 禁用'),
            blockExpWindow: Schema.number().default(3600).description('指数增长重置窗口（秒），从最后一次屏蔽结束计算，超出则重置次数'),
            blockNotifyCooldown: Schema.number().default(60).description('屏蔽期间提示消息的冷却时间（秒），避免刷屏'),
            warnMsg: Schema.string().default('发言频率过高，请慢一点~').description('首次超限警告消息'),
            blockMsg: Schema.string().default('发言频率过高，已被禁用 {duration} 秒。').description('进入屏蔽时的通知，支持变量 {duration}'),
            blockedMsg: Schema.string().default('暂时被禁用，还有 {time} 秒解禁。').description('屏蔽期间再次触发时的提示，支持变量 {time}'),
        }).description('频率控制'),
    }),
    Schema.object({
        botSwitch: Schema.object({
            enabled: Schema.boolean().default(true).description('启用群聊 bot 开关'),
            defaultState: Schema.boolean().default(true).description('默认开启状态'),
            disabledMessage: Schema.string().default('机器人当前在此群处于关闭状态，请使用 bot-on 开启。').description('关闭状态下被 @ 时的提示'),
        }).description('机器人开关控制'),
    }),
]) as Schema<Config>
