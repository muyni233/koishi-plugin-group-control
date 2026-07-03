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
- **统一审核指令**：`gc.approve`/`gc.reject`/`gc.ban`/`gc.unban`/`gc.pending` 统一处理群邀请与好友申请，可引用机器人通知自动解析目标（也可加 `group:`/`friend:` 前缀）
- **频率控制**：限制群聊/私聊的指令及对话频率，支持指数增长屏蔽时长
- **Bot 开关**：按群独立开关 bot，关闭后屏蔽所有响应
- **好友/群管理**：列出好友、删除好友、列出所在群、远程退出指定群
- **被禁言通知**：bot 被禁言时可选通知管理员；被禁言时长达到阈值时可自动退群并拉黑
- **权限管理**：主/副管理员分级；支持 Koishi authority 或内置群管理员两种权限模式

---

## 配置说明

### 管理员配置

管理员分为主管理员与副管理员，均可添加多个：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `admin.primaryAdmins` | `[]` | 主管理员QQ号列表（绕过群管理员指令校验；通知默认发给首个主管理员） |
| `admin.deputyAdmins` | `[]` | 副管理员QQ号列表（可用 gc 指令，其它群管理员指令仍会校验身份） |
| `admin.notificationGroupId` | *(空)* | 通知群号（填写后发到此群，否则私聊首个主管理员） |

> 所有 `gc` 系列指令主、副管理员均可使用；主管理员额外可绕过 `bot-on`/`bot-off`/`quit` 等群级指令的群管理员身份校验。`koishi` 模式下不区分主副，由 `koishiAuthority` 决定。

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
| `autoApprove` | `false` | 自动同意邀请（无需管理员审核） |
| `notifyAdminOnApprove` | `true` | 自动同意时是否仍通知管理员 |
| `inviteWaitMessage` | *(见配置)* | 发给邀请者的等待提示，支持 `{groupName}`, `{groupId}`, `{userName}`, `{userId}` |
| `inviteApproveMessage` | *(见配置)* | 自动同意时发给邀请者的提示，支持 `{groupName}`, `{groupId}`, `{userName}`, `{userId}` |
| `inviteRequestMessage` | *(见配置)* | 发给管理员的请求消息，支持 `{groupName}`, `{groupId}`, `{userName}`, `{userId}` |
| `inviteApproveNotificationMessage` | *(见配置)* | 自动同意时发给管理员的通知，支持 `{groupName}`, `{groupId}`, `{userName}`, `{userId}` |
| `inviteExpireDays` | `3` | 邀请记录过期天数 |

### 机器人开关

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `enabled` | `true` | 启用群聊 bot 开关功能 |
| `defaultState` | `true` | 默认开启状态 |
| `disabledMessage` | *(见配置)* | 关闭状态下被 @ 时的提示 |

### 日志与调试

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `verbose` | `false` | 调试模式：开启后输出 debug 级别日志，并启用 `gc.debug` 接口测试指令 |
| `smallGroupRobotUinRangeMode` | `false` | 调试用：小群检测改用 `get_robot_uin_range` 号段区间判定官方机器人（适配器 `is_robot` 字段失效时启用，接口不可用或调用失败时自动回退 `is_robot`） |

---

## 指令列表

所有管理员指令统一收纳在 `gc` 主指令下，输入 `gc` 可查看子指令列表。

#### 目标解析

`gc.approve`/`gc.reject`/`gc.ban`/`gc.unban`/`gc.leave`/`gc.sg-add`/`gc.sg-rm`/`gc.del` 的「目标」均可用以下方式指定，按优先级生效：

1. **带参数**：`gc.<指令> <号码>`。可加前缀强制区分域——`group:<号>`（群）/ `friend:<号>`（好友），简写 `g:` / `f:`、中文 `群:` / `好友:` 均可。
2. **引用机器人通知**：回复（引用）机器人发的「收到新的群聊邀请请求」「收到新的好友申请」「已自动拒绝黑名单群邀请」「机器人被未经审核地拉入群聊」等通知，指令可不带参数。

> - **自动识别**（仅 approve/reject/ban/unban）：裸号会从待处理请求里自动判断群/好友；ban/unban 的裸号默认按**群**。若同号同时命中群邀请与好友申请，会提示加前缀区分。
> - **域固定指令**（`gc.leave`/`gc.sg-add`/`gc.sg-rm` 处理群，`gc.del` 处理好友）：裸号按各自域处理，引用通知时域须匹配，跨域引用会被拒绝并提示。

### 审核 / 待定（gc 子指令，主、副管理员均可）

| 指令 | 说明 |
|------|------|
| `gc.approve [目标]` | 同意待处理请求（群邀请 / 好友申请，支持引用通知或 `group:`/`friend:` 前缀） |
| `gc.reject [目标]` | 拒绝待处理请求（同上） |
| `gc.pending` | 查看全部待处理请求（群邀请 + 好友申请，合并转发） |

### 黑名单 / 小群白名单（gc 子指令，主、副管理员均可）

| 指令 | 说明 |
|------|------|
| `gc.ban [目标]` | 拉黑群聊（群黑名单）或好友（好友黑名单，并删除好友、拒绝其后续申请）。引用「被拉入小群」通知可拉黑小群 |
| `gc.unban [目标]` | 解除群聊/好友黑名单。引用「已自动拒绝黑名单群邀请」通知可拉出黑名单 |
| `gc.banlist` | 查看黑名单（群 + 好友，合并转发） |
| `gc.clearban` | 清空**群**黑名单 |
| `gc.sg-add [目标]` | 将群加入小群白名单，不受人数限制（可引用群通知） |
| `gc.sg-rm [目标]` | 从小群白名单移除群（可引用群通知） |
| `gc.sg-list` | 查看小群白名单（合并转发） |

### 其他 gc 指令（主、副管理员均可）

| 指令 | 说明 |
|------|------|
| `gc.friends` | 列出机器人的好友（合并转发形式发送） |
| `gc.del [目标]` | 删除好友（可引用好友申请通知，或加 `friend:` 前缀） |
| `gc.groups` | 列出机器人所在的群（合并转发形式发送） |
| `gc.leave [目标]` | 退出指定群（可引用群通知，或加 `group:` 前缀） |

### 群聊管理

| 指令 | 说明 | 权限 |
|------|------|------|
| `quit` | 让 bot 退出当前群聊 | 群管理员 |
| `bot-on` | 开启当前群的 bot | 群管理员 |
| `bot-off` | 关闭当前群的 bot | 群管理员 |

---

## 注意事项

- 本插件仅支持 **OneBot 适配器**（如 go-cqhttp、LLOneBot 等）
- 管理员通知默认私聊首个（0号）主管理员；填写 `admin.notificationGroupId` 后改发到该群。未配置主管理员且未填通知群号时无法收到通知
- **引用解析依赖关键字**：引用机器人通知来执行 `gc.approve`/`gc.ban` 等指令时，靠通知文案里的 `群号：` / `好友申请`+`QQ：` 字样定位目标。自定义 `inviteRequestMessage`、`kickNotificationMessage`、`smallGroupQualifiedMessage`、`muteNotificationMessage` 等模板时需保留这些字样（如 `群号：{groupId}`），否则引用解析会失效
- 频率控制的非指令拦截（@ 对话、私聊）不影响入群欢迎等系统事件
- 小群合格通知仅在启用了 `smallGroupAutoQuit` 且未经 `gc.approve` 审核通过的情况下触发
- **小群人数统计**：开启 `smallGroupExcludeOfficialBots` 后只计真人成员（排除 `is_robot` 机器人与自身）。检测做了分级短路以减少接口调用——原始人数 ≤ 阈值直接退群、原始人数 > 阈值 + 20（单群机器人上限）直接保留，仅当人数处于中间区间时才拉取一次成员列表，且统计到足够机器人即提前结束遍历
- **号段判定模式（调试用）**：适配器 `is_robot` 字段不准时，开启 `smallGroupRobotUinRangeMode` 改用 `get_robot_uin_range` 号段区间判定官方机器人；接口不可用时自动回退 `is_robot`
- **实时小群监控**：纯事件驱动（仅监听成员退群），不做轮询，配合 per-群冷却限流，几乎不增加接口压力。**经 `gc.approve` 审核通过或在小群白名单中的群永久豁免**，仅监控未经审核被拉入的群；机器人退出某群后其审核标记自动清除，若日后被未经审核地重新拉入会重新接受检测
