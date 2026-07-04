import { Schema } from 'koishi'

export interface GroupConfig {
    // —— 欢迎消息 / quit 指令 ——
    quitCommandEnabled: boolean
    // —— 被踢自动拉黑 ——
    enableBlacklist: boolean
    notifyAdminOnKick: boolean
    // —— 小群自动退群 ——
    smallGroupAutoQuit: boolean
    smallGroupThreshold: number
    smallGroupExcludeOfficialBots: boolean
    smallGroupCheckDelay: number
    smallGroupNotifyAdmin: boolean
    // —— 实时小群监控 ——
    smallGroupRealtimeMonitor: boolean
    smallGroupRecheckCooldown: number
    // —— 合格小群通知 ——
    smallGroupQualifiedNotifyAdmin: boolean
    // —— 被禁言处理 ——
    notifyAdminOnMute: boolean
    muteAutoQuit: boolean
    muteAutoQuitThreshold: number
}

export interface AdminConfig {
    primaryAdmins: string[]
    deputyAdmins: string[]
    notificationGroupId: string
}

export interface GroupInviteConfig {
    enabled: boolean
    autoApprove: boolean
    notifyAdminOnApprove: boolean
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
}

export interface FriendConfig {
    enabled: boolean
    autoApprove: boolean
    notifyAdminOnApprove: boolean
    requestExpireDays: number
}

export interface BotSwitchConfig {
    enabled: boolean
    defaultState: boolean
}

export interface PermissionConfig {
    mode: 'koishi' | 'builtin'
    koishiAuthority: number
    protectedCommands: string[]
}

export interface LoggingConfig {
    verbose: boolean
    smallGroupRobotUinRangeMode: boolean
}

/**
 * 文案自定义。集中本插件所有出站提示/通知文案。
 *
 * 命名约定：域前缀 + 语义名。`*Message` 走 sendMessage / notifyAdmins；
 * `*Notification` 是给管理员的通知；`*Prompt` 是给最终用户（邀请者/申请者）的私聊提示。
 *
 * 模板变量统一用 `{key}` 形式，经 escapeTpl 插值（外部输入自动 h.escape）。
 *
 * 文案风格：用户面前端轻可爱；管理员告警结构化、易扫读，并保留 `群号：` / `好友申请`+`QQ：` 等
 * 关键字——引用机器人通知来执行 `gc.approve`/`gc.ban` 等指令时靠这些关键字定位目标，
 * 自定义文案时务必保留。
 */
export interface MessagesConfig {
    // —— 欢迎 / 退群 / 黑名单提示（群内广播）——
    welcomeMessage: string
    quitMessage: string
    blacklistMessage: string
    smallGroupQuitMessage: string
    // —— 给管理员的告警通知 ——
    kickNotificationMessage: string
    smallGroupQuitNotificationMessage: string
    smallGroupQualifiedMessage: string
    muteNotificationMessage: string
    muteQuitNotificationMessage: string
    quitCommandNotificationMessage: string
    // —— 群聊邀请审核 ——
    inviteRequestMessage: string
    inviteApproveNotificationMessage: string
    inviteWaitPrompt: string
    inviteApprovePrompt: string
    inviteRejectPrompt: string
    inviteBlacklistRejectPrompt: string
    inviteBlacklistRejectNotification: string
    // —— 好友申请管理 ——
    friendRequestMessage: string
    friendApproveNotificationMessage: string
    friendBlacklistRejectNotification: string
    // —— 频率控制 ——
    frequencyWarnMessage: string
    frequencyBlockMessage: string
    frequencyBlockedMessage: string
    // —— Bot 开关 ——
    botDisabledMessage: string
}

export interface Config {
    admin: AdminConfig
    permission: PermissionConfig
    basic: GroupConfig
    invite: GroupInviteConfig
    friend: FriendConfig
    frequency: FrequencyConfig
    botSwitch: BotSwitchConfig
    logging: LoggingConfig
    messages: MessagesConfig
}

export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
        admin: Schema.object({
            primaryAdmins: Schema.array(String).default([]).description('主管理员QQ号列表（绕过群管理员指令校验；通知默认发给首个主管理员）'),
            deputyAdmins: Schema.array(String).default([]).description('副管理员QQ号列表（可用 gc 指令，其它群管理员指令仍会校验身份）'),
            notificationGroupId: Schema.string().description('通知群号（填写后发到此群，否则私聊首个主管理员）'),
        }).description('管理员配置'),
    }),
    Schema.object({
        permission: Schema.object({
            mode: Schema.union([
                Schema.const('koishi').description('使用 Koishi 自带权限系统 (authority)'),
                Schema.const('builtin').description('使用插件内置权限管理 (群管理员/群主)'),
            ]).default('builtin').description('权限管理模式'),
            koishiAuthority: Schema.natural().default(3).description('Koishi 模式下管理指令所需的最低权限等级'),
            protectedCommands: Schema.array(String).default([]).description('需要群管理员权限才能使用的自定义指令名列表'),
        }).description('权限管理'),
    }),
    Schema.object({
        basic: Schema.object({
            // —— 欢迎消息 / quit 指令 ——
            quitCommandEnabled: Schema.boolean().default(true).description('启用 quit 指令'),
            // —— 被踢自动拉黑 ——
            enableBlacklist: Schema.boolean().default(true).description('启用被踢出自动拉黑'),
            notifyAdminOnKick: Schema.boolean().default(true).description('被踢出群时通知管理员'),
            // —— 小群自动退群 ——
            smallGroupAutoQuit: Schema.boolean().default(false).description('启用小群自动退群'),
            smallGroupThreshold: Schema.natural().min(1).default(30).description('小群人数阈值（真人数 ≤ 此值即判为小群）'),
            smallGroupExcludeOfficialBots: Schema.boolean().default(true).description('统计人数时排除 QQ 官方机器人（is_robot）及机器人自身，仅统计真人'),
            smallGroupCheckDelay: Schema.natural().default(3000).description('入群后延迟检测的时间（毫秒），等待成员列表就绪'),
            smallGroupNotifyAdmin: Schema.boolean().default(true).description('小群自动退群时通知管理员'),
            // —— 实时小群监控 ——
            smallGroupRealtimeMonitor: Schema.boolean().default(true).description('实时监控：监听成员退群事件，群缩小到阈值以下时再次自动退群'),
            smallGroupRecheckCooldown: Schema.natural().default(60).description('实时监控：同一群两次复检的最小间隔（秒），避免成员批量退群时频繁调接口'),
            // —— 合格小群通知 ——
            smallGroupQualifiedNotifyAdmin: Schema.boolean().default(true).description('被未经审核拉入但人数达标的群是否通知管理员'),
            // —— 被禁言处理 ——
            notifyAdminOnMute: Schema.boolean().default(false).description('机器人被禁言时通知管理员'),
            muteAutoQuit: Schema.boolean().default(false).description('被禁言达到阈值时自动退群并拉黑'),
            muteAutoQuitThreshold: Schema.natural().default(600).description('触发自动退群的禁言时长阈值（秒），被禁言 ≥ 此值即退群并拉黑'),
        }).description('基础群组管理'),
    }),
    Schema.object({
        invite: Schema.object({
            enabled: Schema.boolean().default(false).description('启用群聊邀请审核'),
            autoApprove: Schema.boolean().default(false).description('自动同意邀请'),
            notifyAdminOnApprove: Schema.boolean().default(true).description('自动同意时是否仍通知管理员'),
            inviteExpireDays: Schema.natural().default(3).description('邀请记录过期天数'),
        }).description('群聊邀请审核'),
    }),
    Schema.object({
        friend: Schema.object({
            enabled: Schema.boolean().default(false).description('启用好友申请管理'),
            autoApprove: Schema.boolean().default(false).description('自动通过好友申请（否则通知管理员手动处理）'),
            notifyAdminOnApprove: Schema.boolean().default(true).description('自动通过时是否仍通知管理员'),
            requestExpireDays: Schema.natural().default(7).description('待处理申请的过期天数'),
        }).description('好友申请管理'),
    }),
    Schema.object({
        frequency: Schema.object({
            enabled: Schema.boolean().default(false).description('启用群聊频率控制（指令及 @ 对话均受限）'),
            limit: Schema.natural().default(5).description('群聊：时间窗口内允许的最大触发次数'),
            window: Schema.natural().default(60).description('群聊：时间窗口（秒）'),
            warnDelay: Schema.natural().default(30).description('群聊：警告后再次触发的时间阈值（秒），超出则进入屏蔽'),
            blockDur: Schema.natural().default(300).description('群聊：首次屏蔽的基础时长（秒）'),
            whitelist: Schema.array(String).default([]).description('群聊：不受频率限制的群号列表'),
            privateEnabled: Schema.boolean().default(false).description('启用私聊频率控制'),
            privateLimit: Schema.natural().default(10).description('私聊：时间窗口内允许的最大触发次数'),
            privateWindow: Schema.natural().default(60).description('私聊：时间窗口（秒）'),
            privateWarnDelay: Schema.natural().default(30).description('私聊：警告后再次触发的时间阈值（秒），超出则进入屏蔽'),
            privateBlockDur: Schema.natural().default(300).description('私聊：首次屏蔽的基础时长（秒）'),
            privateWhitelist: Schema.array(String).default([]).description('私聊：不受频率限制的用户ID列表'),
            blockExpBase: Schema.natural().min(1).default(2).description('全局：屏蔽时长指数增长底数（时长 = blockDur × base^(次数-1)），设为 1 禁用'),
            blockExpWindow: Schema.natural().default(3600).description('全局：指数增长重置窗口（秒），从最后一次屏蔽结束计算，超出则重置次数'),
            blockNotifyCooldown: Schema.natural().default(60).description('全局：屏蔽期间提示消息的冷却时间（秒），避免刷屏'),
        }).description('频率控制'),
    }),
    Schema.object({
        botSwitch: Schema.object({
            enabled: Schema.boolean().default(true).description('启用群聊 bot 开关'),
            defaultState: Schema.boolean().default(true).description('默认开启状态'),
        }).description('机器人开关控制'),
    }),
    Schema.object({
        logging: Schema.object({
            verbose: Schema.boolean().default(false).description('调试模式：开启后输出 debug 级别日志，并启用 gc.debug 接口测试指令'),
            smallGroupRobotUinRangeMode: Schema.boolean().default(false).description('调试用：小群检测改用 get_robot_uin_range 号段区间判定官方机器人（适配器 is_robot 字段失效时启用，调用失败回退 is_robot）'),
        }).description('日志与调试'),
    }),
    Schema.object({
        messages: Schema.object({
            // —— 欢迎 / 退群 / 黑名单提示（群内广播）——
            welcomeMessage: Schema.string().role('textarea').default('大家好，我是本群的机器人，请多关照~').description('加入群聊时发送的欢迎消息'),
            quitMessage: Schema.string().role('textarea').default('收到 {userId} 的指令，机器人即将退出本群。').description('quit 指令触发后的群内提示'),
            blacklistMessage: Schema.string().role('textarea').default('本群已被拉黑，机器人将自动退出。如有疑问，请联系管理员。').description('被拉入黑名单群后的群内提示'),
            smallGroupQuitMessage: Schema.string().role('textarea').default('本群人数不足（当前{memberCount}人，需≥{threshold}人），机器人即将退出本群，如有需求请联系管理员。').description('小群自动退群时的群内提示'),
            // —— 给管理员的告警通知 ——
            kickNotificationMessage: Schema.string().role('textarea').default('我被踢出了群聊\n群名称：{groupName}\n群号：{groupId}\n已自动加入黑名单。').description('机器人被踢后给管理员的通知'),
            smallGroupQuitNotificationMessage: Schema.string().role('textarea').default('我退出了一个小群\n群名称：{groupName}\n群号：{groupId}\n群成员数：{memberCount}人（阈值：{threshold}人）').description('小群自动退群时给管理员的通知'),
            smallGroupQualifiedMessage: Schema.string().role('textarea').default('我被拉进了一个群聊，但未经审核\n群名称：{groupName}\n群号：{groupId}\n当前人数：{memberCount}人（阈值：{threshold}人）\n人数已达标，请确认是否保留。').description('合格小群给管理员的通知'),
            muteNotificationMessage: Schema.string().role('textarea').default('我被禁言了\n群名称：{groupName}\n群号：{groupId}\n操作者：{userName}（QQ：{userId}）\n禁言时长：{duration}秒').description('机器人被禁言后给管理员的通知'),
            muteQuitNotificationMessage: Schema.string().role('textarea').default('我被长时间禁言，已自动退群并拉黑\n群名称：{groupName}\n群号：{groupId}\n操作者：{userName}（QQ：{userId}）\n禁言时长：{duration}秒').description('被禁言自动退群时给管理员的通知'),
            quitCommandNotificationMessage: Schema.string().role('textarea').default('收到退群指令\n群名称：{groupName}\n群号：{groupId}\n操作者：{userName}（QQ：{userId}）').description('quit 指令触发时给管理员的通知'),
            // —— 群聊邀请审核 ——
            inviteRequestMessage: Schema.string().role('textarea').default('收到一条新的群聊邀请\n群名称：{groupName}\n群号：{groupId}\n邀请者：{userName}（QQ：{userId}）\n\n同意请发送 gc.approve {groupId}，拒绝请发送 gc.reject {groupId}；也可以直接引用本条消息发送指令。').description('收到群邀请时给管理员的请求通知'),
            inviteApproveNotificationMessage: Schema.string().role('textarea').default('已自动通过一条群聊邀请\n群名称：{groupName}\n群号：{groupId}\n邀请者：{userName}（QQ：{userId}）').description('自动同意群邀请后给管理员的通知'),
            inviteWaitPrompt: Schema.string().role('textarea').default('已收到您的群聊邀请，管理员正在审核中，请耐心等待~').description('人工审核时发给邀请者的等待提示'),
            inviteApprovePrompt: Schema.string().role('textarea').default('您的群聊邀请已通过审核，机器人正在加入群聊。').description('群邀请通过后发给邀请者的提示'),
            inviteRejectPrompt: Schema.string().role('textarea').default('很抱歉，您的群聊邀请未通过审核，机器人将不会加入该群聊。').description('群邀请被拒后发给邀请者的提示'),
            inviteBlacklistRejectPrompt: Schema.string().role('textarea').default('很抱歉，您邀请的群 {groupId} 已被机器人拉黑，邀请已被自动拒绝。如有疑问，请联系机器人管理员。').description('群邀请命中黑名单时发给邀请者的提示'),
            inviteBlacklistRejectNotification: Schema.string().role('textarea').default('已自动拒绝一条黑名单群邀请\n群名称：{groupName}\n群号：{groupId}\n邀请者QQ：{userId}\n如需放行，请先发送 gc.unban {groupId}，再让对方重新邀请。').description('黑名单群邀请自动拒绝后给管理员的通知'),
            // —— 好友申请管理 ——
            friendRequestMessage: Schema.string().role('textarea').default('收到一条新的好友申请\nQQ：{userId}\n昵称：{nickname}\n附言：{comment}\n\n同意请发送 gc.approve {userId}，拒绝请发送 gc.reject {userId}；也可以直接引用本条消息发送指令。').description('收到好友申请时给管理员的通知'),
            friendApproveNotificationMessage: Schema.string().role('textarea').default('已自动通过一条好友申请\nQQ：{userId}\n昵称：{nickname}\n附言：{comment}').description('自动通过好友申请后给管理员的通知'),
            friendBlacklistRejectNotification: Schema.string().role('textarea').default('已自动拒绝一条黑名单好友申请\nQQ：{userId}\n昵称：{nickname}\n附言：{comment}').description('黑名单好友申请自动拒绝后给管理员的通知'),
            // —— 频率控制 ——
            frequencyWarnMessage: Schema.string().default('发言有点快哦，慢一点吧~').description('频率首次超限时的警告消息'),
            frequencyBlockMessage: Schema.string().default('发言频率过高，已限制发言 {duration} 秒。').description('进入屏蔽时的通知'),
            frequencyBlockedMessage: Schema.string().default('发言限制还没解除，再等 {time} 秒吧~').description('屏蔽期间再次触发时的提示'),
            // —— Bot 开关 ——
            botDisabledMessage: Schema.string().role('textarea').default('机器人正在休眠，请发送 bot-on 唤醒我~').description('bot 关闭状态下被 @ 或触发受保护指令时的提示'),
        }).description('文案自定义'),
    }),
]) as Schema<Config>
