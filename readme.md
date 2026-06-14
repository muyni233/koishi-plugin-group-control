# koishi-plugin-group-control

[![npm](https://img.shields.io/npm/v/koishi-plugin-group-control?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-group-control)

Koishi 插件，多功能群聊自管理工具。仅支持 OneBot 适配器。

> 使用 AI Agent 协助完成

---

## 功能概览

- **黑名单管理**：被踢出群后自动拉黑，下次被邀请时自动退出
- **小群自动退群**：加入人数不足的群时自动退出并通知管理员，统计人数时自动排除 QQ 官方机器人（仅计真人）
- **实时小群监控**：监听成员退群事件，群缩水到阈值以下时自动退出（仅针对未经审核拉入的群）
- **合格小群通知**：未经审核被拉入人数达标的群时，通知管理员确认
- **群聊邀请审核**：收到邀请时暂缓加入，等待管理员审核
- **好友申请管理**：收到好友申请时通知管理员，或自动通过
- **频率控制**：限制群聊/私聊的指令及对话频率，支持指数增长屏蔽时长
- **Bot 开关**：按群独立开关 bot，关闭后屏蔽所有响应
- **好友/群管理**：指令列出好友（合并转发）、删除好友、列出所在群、远程退出指定群
- **被禁言通知**：bot 被禁言时可选通知管理员；被禁言时长达到阈值时可自动退群并拉黑
- **权限管理**：支持 Koishi authority 或内置群管理员两种权限模式

---

## 配置说明

### 管理员配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `admin.adminQQs` | `[]` | 管理员QQ号列表（权限验证及通知） |
| `admin.notificationGroupId` | *(空)* | 通知群号（填写后发到此群，否则私聊管理员） |

### 权限管理

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `mode` | `builtin` | `builtin`：使用群管理员/群主权限；`koishi`：使用 Koishi authority |
| `koishiAuthority` | `3` | Koishi 模式下管理指令所需的最低权限等级 |
| `protectedCommands` | `[]` | 需要群管理员权限才能使用的自定义指令名列表 |

### 基础群组管理

**欢迎 & 退群**

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `welcomeMessage` | `你好，我是机器人。` | 加入群聊时发送的欢迎消息 |
| `quitMessage` | `收到来自{userId}的指令，即将退出群聊。` | quit 指令触发后的群内提示，支持 `{userId}` |
| `quitCommandEnabled` | `true` | 是否启用 quit 指令 |

**黑名单**

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `enableBlacklist` | `true` | 启用被踢出自动拉黑 |
| `blacklistMessage` | *(见配置)* | 被拉入黑名单群后的提示 |

**踢出通知**

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `notifyAdminOnKick` | `true` | 被踢出时通知管理员 |
| `kickNotificationMessage` | *(见配置)* | 通知消息模板，支持 `{groupId}`, `{groupName}` |

**小群自动退群**

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `smallGroupAutoQuit` | `false` | 启用小群自动退群 |
| `smallGroupThreshold` | `30` | 人数阈值，低于等于此值时自动退出 |
| `smallGroupExcludeOfficialBots` | `true` | 统计群人数时排除 QQ 官方机器人（`is_robot`）及机器人自身，仅统计真人成员 |
| `smallGroupRealtimeMonitor` | `true` | 实时监控群人数：监听成员退群事件，群缩小到阈值以下时自动退群（仅监控未经审核拉入的群） |
| `smallGroupRecheckCooldown` | `60` | 实时监控时同一群两次复检的最小间隔（秒），避免成员批量退群时频繁调用接口 |
| `smallGroupQuitMessage` | *(见配置)* | 退群提示，支持 `{memberCount}`, `{threshold}`, `{groupName}`, `{groupId}` |
| `smallGroupNotifyAdmin` | `true` | 自动退群时通知管理员 |
| `smallGroupCheckDelay` | `3000` | 加入后延迟检测的时间（毫秒） |

**合格小群通知**

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `smallGroupQualifiedNotifyAdmin` | `true` | 未经审核被拉入人数达标的群时通知管理员 |
| `smallGroupQualifiedMessage` | *(见配置)* | 通知消息模板，支持 `{groupName}`, `{groupId}`, `{memberCount}`, `{threshold}` |

**被禁言通知**

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `notifyAdminOnMute` | `false` | bot 被禁言时通知管理员 |
| `muteNotificationMessage` | *(见配置)* | 通知消息模板，支持 `{groupId}`, `{groupName}`, `{operatorId}`, `{duration}` |
| `muteAutoQuit` | `false` | bot 被禁言达到阈值时自动退群并拉黑 |
| `muteAutoQuitThreshold` | `600` | 触发自动退群的禁言时长阈值（秒），被禁言时长 ≥ 此值即退群并拉黑 |
| `muteQuitNotificationMessage` | *(见配置)* | 自动退群时发给管理员的通知模板，支持 `{groupId}`, `{groupName}`, `{operatorId}`, `{duration}` |

### 频率控制

**群聊**

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `enabled` | `false` | 启用群聊频率控制（指令及 @ 对话均受限） |
| `limit` | `5` | 时间窗口内允许的最大触发次数 |
| `window` | `60` | 时间窗口（秒） |
| `warnDelay` | `30` | 警告后再次触发的时间阈值（秒），超出则进入屏蔽 |
| `blockDur` | `300` | 首次屏蔽的基础时长（秒） |
| `whitelist` | `[]` | 不受频率限制的群号列表 |

**私聊**

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `privateEnabled` | `false` | 启用私聊频率控制 |
| `privateLimit` | `10` | 私聊时间窗口内允许的最大触发次数 |
| `privateWindow` | `60` | 私聊时间窗口（秒） |
| `privateWarnDelay` | `30` | 私聊警告后再次触发的时间阈值（秒） |
| `privateBlockDur` | `300` | 私聊首次屏蔽的基础时长（秒） |
| `privateWhitelist` | `[]` | 不受私聊频率限制的用户ID列表 |

**指数增长（群聊和私聊共用）**

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `blockExpBase` | `2` | 指数增长底数，每次屏蔽时长 = `blockDur × base^(次数-1)`，设为 `1` 禁用 |
| `blockExpWindow` | `3600` | 指数增长重置窗口（秒），从最后一次屏蔽结束计算，超出则重置屏蔽次数 |

**提示消息**

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `blockNotifyCooldown` | `60` | 屏蔽期间重复触发时提示消息的冷却时间（秒），避免刷屏 |
| `warnMsg` | `发言频率过高，请慢一点~` | 首次超限警告消息 |
| `blockMsg` | `发言频率过高，已被禁用 {duration} 秒。` | 进入屏蔽时的通知，支持 `{duration}` |
| `blockedMsg` | `暂时被禁用，还有 {time} 秒解禁。` | 屏蔽期间再次触发时的提示，支持 `{time}` |

### 好友申请管理

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `enabled` | `false` | 启用好友申请管理 |
| `autoApprove` | `false` | 自动通过好友申请，否则通知管理员手动处理 |
| `notifyAdminOnApprove` | `true` | 自动通过时是否仍通知管理员 |
| `requestExpireDays` | `7` | 待处理申请的过期天数 |
| `requestMessage` | *(见配置)* | 通知管理员的消息模板，支持 `{userId}`, `{nickname}`, `{comment}` |
| `approveNotificationMessage` | *(见配置)* | 自动通过时的通知消息模板，支持 `{userId}`, `{nickname}`, `{comment}` |

### 群聊邀请审核

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `enabled` | `false` | 启用邀请审核 |
| `inviteWaitMessage` | *(见配置)* | 发给邀请者的等待提示 |
| `inviteRequestMessage` | *(见配置)* | 发给管理员的请求消息，支持 `{groupName}`, `{groupId}`, `{userName}`, `{userId}` |
| `autoApprove` | `false` | 未配置管理员时自动同意邀请 |
| `showDetailedLog` | `false` | 显示详细日志 |
| `inviteExpireDays` | `3` | 邀请记录过期天数 |

### 机器人开关

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `enabled` | `true` | 启用群聊 bot 开关功能 |
| `defaultState` | `true` | 默认开启状态 |
| `disabledMessage` | *(见配置)* | 关闭状态下被 @ 时的提示 |

---

## 指令列表

所有管理员指令统一收纳在 `gc` 主指令下，输入 `gc` 可查看子指令列表。

### 管理员指令（gc 子指令，需全局管理员）

| 指令 | 说明 |
|------|------|
| `gc.banlist` | 查看黑名单列表 |
| `gc.ban <群号>` | 添加群到黑名单 |
| `gc.unban <群号>` | 从黑名单移除群 |
| `gc.clearban` | 清空黑名单 |
| `gc.sg-add <群号>` | 将群加入小群白名单，不受人数限制 |
| `gc.sg-rm <群号>` | 从小群白名单移除群 |
| `gc.sg-list` | 查看小群白名单 |
| `gc.friends` | 列出机器人的好友（合并转发形式发送） |
| `gc.delfriend <QQ号>` | 删除指定好友 |
| `gc.groups` | 列出机器人所在的群（合并转发形式发送） |
| `gc.leave <群号>` | 让机器人退出指定群 |
| `gc.approve <群号>` | 同意加入指定群 |
| `gc.reject <群号>` | 拒绝加入指定群 |
| `gc.pending` | 查看待处理的群聊邀请列表 |
| `gc.friend-approve <QQ号>` | 同意好友申请（兼容别名：`gc.fa`） |
| `gc.friend-reject <QQ号>` | 拒绝好友申请（兼容别名：`gc.fr`） |
| `gc.friend-pending` | 查看待处理的好友申请列表（兼容别名：`gc.fp`） |

### 群聊管理

| 指令 | 说明 | 权限 |
|------|------|------|
| `quit` | 让 bot 退出当前群聊 | 群管理员 |
| `bot-on` | 开启当前群的 bot | 群管理员 |
| `bot-off` | 关闭当前群的 bot | 群管理员 |

---

## 注意事项

- 本插件仅支持 **OneBot 适配器**（如 go-cqhttp、LLOneBot 等）
- 管理员通知依赖 `admin.adminQQs` 或 `admin.notificationGroupId` 的配置，未配置则无法收到通知
- 频率控制的非指令拦截（@ 对话、私聊）不影响入群欢迎等系统事件
- 小群合格通知仅在启用了 `smallGroupAutoQuit` 且未经 `gc.approve` 审核通过的情况下触发
- **小群人数统计**：开启 `smallGroupExcludeOfficialBots` 后只计真人成员（排除 `is_robot` 机器人与自身）。检测做了分级短路以减少接口调用——原始人数 ≤ 阈值直接退群、原始人数 > 阈值 + 20（单群机器人上限）直接保留，仅当人数处于中间区间时才拉取一次成员列表，且统计到足够机器人即提前结束遍历
- **实时小群监控**：纯事件驱动（仅监听成员退群），不做轮询，配合 per-群冷却限流，几乎不增加接口压力。**经 `gc.approve` 审核通过或在小群白名单中的群永久豁免**，仅监控未经审核被拉入的群；机器人退出某群后其审核标记自动清除，若日后被未经审核地重新拉入会重新接受检测
