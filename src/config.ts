import { Schema } from 'koishi'

export interface GroupConfig {
    welcomeMessage: string
    blacklistMessage: string
    quitMessage: string
    enableBlacklist: boolean
    quitCommandEnabled: boolean
    quitCommandAuthority: number
    notifyAdminOnKick: boolean          // 被踢出群时通知管理员
    kickNotificationMessage: string     // 被踢出群通知消息模板
    smallGroupAutoQuit: boolean         // 小群自动退群
    smallGroupThreshold: number         // 小群人数阈值
    smallGroupQuitMessage: string       // 小群自动退群时发送的消息
    smallGroupNotifyAdmin: boolean      // 小群自动退群时通知管理员
}

export interface GroupInviteConfig {
    enabled: boolean                   // 启用群聊邀请审核功能
    adminQQs: string[]                 // 管理员QQ号列表
    notificationGroupId: string        // 通知群号（可选）
    inviteWaitMessage: string          // 发送给邀请者的等待审核提示消息
    inviteRequestMessage: string       // 发送给管理员的邀请请求消息模板
    autoApprove: boolean               // 是否自动同意邀请
    showDetailedLog: boolean           // 是否显示详细日志
}

export interface FrequencyConfig {
    enabled: boolean                   // 启用
    limit: number                      // 限制次数
    window: number                     // 时间窗口（秒）
    warnDelay: number                  // 警告延迟时间（秒）
    blockDur: number                   // 屏蔽时长（秒）
    warnMsg: string                    // 警告消息
    blockMsg: string                   // 屏蔽消息
    blockedMsg: string                 // 屏蔽期间提示
    whitelist: string[]                // 白名单
}

export interface BotSwitchConfig {
    enabled: boolean                   // 是否启用该模块
    defaultState: boolean              // 默认是否开启
    disabledMessage: string            // 关闭状态下被@时的提示
    toggleAuthority: number            // 开关对应指令权限
}

export interface Config {
    basic: GroupConfig
    frequency: FrequencyConfig
    invite: GroupInviteConfig
    botSwitch: BotSwitchConfig
}

export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
        basic: Schema.object({
            welcomeMessage: Schema.string().default('你好，我是机器人。').description('机器人加入群聊时发送的欢迎消息'),
            blacklistMessage: Schema.string().default('此群聊已被拉黑，机器人将自动退出，请联系管理员移出黑名单。').description('被拉入黑名单群后在群内发送的提示'),
            quitMessage: Schema.string().default('收到来自{userId}的指令，即将退出群聊。').description('用户发送quit指令后在群内发送的提示，支持变量{userId}'),
            enableBlacklist: Schema.boolean().default(true).description('启用"被踢出自动拉黑"功能'),
            notifyAdminOnKick: Schema.boolean().default(true).description('被踢出群时通知管理员（需要在群聊邀请审核中配置管理员QQ）'),
            kickNotificationMessage: Schema.string().default('机器人已被踢出群聊\n群号：{groupId}\n该群已被自动加入黑名单。').description('被踢出群通知消息模板，支持变量{groupId}'),
            smallGroupAutoQuit: Schema.boolean().default(false).description('启用小群自动退群功能'),
            smallGroupThreshold: Schema.number().default(30).description('小群人数阈值（群成员数小于等于此值时自动退群）'),
            smallGroupQuitMessage: Schema.string().default('该群人数过少（{memberCount}人），不满足最低人数要求（{threshold}人），机器人将自动退出。').description('小群自动退群时在群内发送的提示，支持变量{memberCount}, {threshold}'),
            smallGroupNotifyAdmin: Schema.boolean().default(true).description('小群自动退群时通知管理员'),
            quitCommandEnabled: Schema.boolean().default(true).description('启用quit'),
            quitCommandAuthority: Schema.number().default(3).description('quit指令所需权限'),
        }).description('基础群组管理'),
    }),
    Schema.object({
        frequency: Schema.object({
            enabled: Schema.boolean().default(false).description('启用频率控制（对所有指令生效）'),
            limit: Schema.number().default(5).description('时间窗口内允许的最大指令次数'),
            window: Schema.number().default(60).description('频率检测时间窗口（秒）'),
            warnDelay: Schema.number().default(30).description('发出警告后，再次触发的时间阈值（秒），在此时间内再次触发则进入屏蔽状态'),
            blockDur: Schema.number().default(300).description('触发频率限制后屏蔽的时长（秒）'),
            warnMsg: Schema.string().default('指令频率过高，请慢一点~').description('频率过高时发送的警告消息'),
            blockMsg: Schema.string().default('指令频率过高，本群指令已被禁用 {duration} 秒。').description('触发频率限制后发送的屏蔽通知消息，支持变量{duration}'),
            blockedMsg: Schema.string().default('指令暂时被禁用，还有 {time} 秒解禁。').description('屏蔽期间接收到指令时的提示消息，支持变量{time}'),
            whitelist: Schema.array(String).default([]).description('频率控制白名单群号列表，白名单内的群聊不受频率限制')
        }).description('指令频率控制'),
    }),
    Schema.object({
        invite: Schema.object({
            enabled: Schema.boolean().default(false).description('启用群聊邀请审核功能'),
            adminQQs: Schema.array(String).default([]).description('管理员QQ号列表（用于权限验证）'),
            notificationGroupId: Schema.string().description('通知群号（可选：若填写，邀请请求将发送到此群；若不填，则发送私聊给管理员）'),
            inviteWaitMessage: Schema.string().default('已收到您的群聊邀请，正在等待管理员审核，请耐心等待。').description('发送给邀请者的等待审核提示消息'),
            inviteRequestMessage: Schema.string().default('收到新的群聊邀请请求：\n群名称：{groupName}\n群号：{groupId}\n邀请者：{userName} (QQ: {userId})\n\n请管理员引用此消息回复"同意"或"拒绝"。').description('发送给管理员的邀请请求消息模板，支持变量{groupName}, {groupId}, {userName}, {userId}'),
            autoApprove: Schema.boolean().default(false).description('是否自动同意邀请（仅在没有指定管理员时）'),
            showDetailedLog: Schema.boolean().default(false).description('是否显示详细日志'),
        }).description('群聊邀请审核'),
    }),
    Schema.object({
        botSwitch: Schema.object({
            enabled: Schema.boolean().default(true).description('启用独立的群聊bot开关功能'),
            defaultState: Schema.boolean().default(true).description('群聊中的默认开启状态'),
            disabledMessage: Schema.string().default('机器人当前在此群处于关闭状态，请使用bot-on开启。').description('机器人在关闭状态下被@时的提示消息'),
            toggleAuthority: Schema.number().default(3).description('开关Bot指令(bot-on/bot-off)所需权限'),
        }).description('机器人开关控制')
    })
]) as Schema<Config>
