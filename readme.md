# koishi-plugin-group-control

[![npm](https://img.shields.io/npm/v/koishi-plugin-group-control?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-group-control)

Koishi 多功能群聊自管理插件，提供黑名单管理、小群清理、好友/群邀请审核、频率限制和 Bot 开关等功能。

> [!NOTE]
> 本插件专为 **OneBot 适配器**（如 NapCat、LLOneBot 等）设计。

---

## 🚀 功能概览

- **黑名单管理**：被踢出群聊时自动拉黑该群，后续收到邀请时自动拒绝，或误入时自动退出。
- **小群自管理**：
  - **自动退群**：当加入人数不足的群聊时自动退出，统计人数时自动排除 QQ 官方机器人及自身。
  - **实时监控**：监听群成员退群事件，当未经审核加入的群聊真人数缩水至阈值或以下时，自动退群。
  - **合格通知**：未经审核被拉入但人数达标的群，发送通知给管理员确认，确认合格后予以保留。
- **审核与申请**：统一的审核事件流，支持群邀请、好友申请的自动通过或管理员手动审核。
- **统一审核指令**：通过 `gc.approve`/`gc.reject`/`gc.ban` 等指令一键处理，支持**回复引用机器人通知**自动解析目标。
- **频率控制**：限制群聊和私聊的指令/普通对话频率，支持处罚时长的指数级增长及重复触发提示冷却。
- **Bot 开关**：支持按群独立开启/关闭机器人，关闭状态下仅响应管理指令，不响应其他消息。
- **其他管理功能**：包含列出好友/群组、远程删除好友、远程退群以及被禁言时退群拉黑等。

---

## ⚙️ 配置说明

插件配置已归类整理为 5 个核心行为分类与 1 个文案自定义分类：

### 1. 管理员与权限配置 (`admin` / `permission`)

用于配置拥有管理权限的用户以及权限校验机制：

| 配置项 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `admin.primaryAdmins` | `[]` | **主管理员** QQ 号列表（绕过群内指令校验；通知默认私聊发给首个主管理员） |
| `admin.deputyAdmins` | `[]` | **副管理员** QQ 号列表（可以使用 `gc` 指令；配置通知群后只能在通知群中使用） |
| `admin.notificationGroupId` | *(空)* | **通知群号**（若填写，所有审核与事件通知发到此群，且副管理员只能在此群使用 `gc` 指令；否则私聊发送至首个主管理员） |
| `permission.mode` | `builtin` | **权限模式**：`builtin` 使用群管理员/群主权限；`koishi` 使用 Koishi 权限系统 |
| `permission.koishiAuthority` | `3` | `koishi` 模式下使用本插件管理指令所需的最低权限等级 |
| `permission.protectedCommands` | `[]` | 需要群管理员权限（或 Koishi 对应权限）才能使用的自定义指令名列表 |

> [!TIP]
> `gc` 系列管理指令对于主、副管理员均可用；配置通知群后，副管理员只能在通知群中使用这些指令。主管理员不受此位置限制，并额外拥有在群聊中绕过 `bot-on`/`bot-off`/`quit` 等指令群管理员身份校验的特权。

---

### 2. 基础群组自管理 (`basic`)

控制自动退群、黑名单、被踢/被禁言的处理逻辑：

| 配置项 | 默认值 | 说明 |
| :--- | :--- | :--- |
| **基础配置** | | |
| `basic.quitCommandEnabled` | `true` | 是否启用 `quit` 指令让 Bot 退出所在群 |
| `basic.enableBlacklist` | `true` | 被踢出群聊时是否自动拉黑该群 |
| `basic.notifyAdminOnKick` | `true` | 机器人被踢出群时，是否通知管理员 |
| **小群自动退群** | | |
| `basic.smallGroupAutoQuit` | `false` | 是否开启小群检测与自动退群功能 |
| `basic.smallGroupThreshold` | `30` | 人数阈值，群内**真人数** ≤ 此值时判定为小群并退群 |
| `basic.smallGroupExcludeOfficialBots` | `true` | 统计人数时是否排除 QQ 官方机器人及 Bot 自身，仅计算真人成员 |
| `basic.smallGroupCheckDelay` | `3000` | 加入群后延迟检测的时间（毫秒），等待成员列表同步就绪 |
| `basic.smallGroupNotifyAdmin` | `true` | 触发小群自动退群时，是否向管理员发送通知 |
| **实时小群监控** | | |
| `basic.smallGroupRealtimeMonitor` | `true` | 是否监听群员退群事件，当人数减少至阈值或以下时自动退出（**仅监控未经审核的群**） |
| `basic.smallGroupRecheckCooldown` | `60` | 同同一群两次触发复检的最小间隔时间（秒），防止成员成批退出时频繁请求 |
| **合格小群通知** | | |
| `basic.smallGroupQualifiedNotifyAdmin` | `true` | 未经审核被拉入但人数达标的群，是否发送通知提醒管理员进行确认 |
| **禁言安全退出** | | |
| `basic.notifyAdminOnMute` | `false` | Bot 被群内禁言时是否通知管理员 |
| `basic.muteAutoQuit` | `false` | Bot 被禁言时间达到阈值时，是否自动退出该群并拉黑 |
| `basic.muteAutoQuitThreshold` | `600` | 触发自动退群的最低禁言时长（秒），禁言时间 ≥ 此值则自动退群并拉黑 |

---

### 3. 频率控制与惩罚 (`frequency`)

限制指令及普通对话的频率，支持指数级增长的屏蔽时间：

| 配置项 | 默认值 | 说明 |
| :--- | :--- | :--- |
| **群聊频率控制** | | |
| `frequency.enabled` | `false` | 是否启用群聊频率控制（所有非管理员指令及 @ 对话均受限） |
| `frequency.limit` | `5` | 在时间窗口内允许的最大触发次数 |
| `frequency.window` | `60` | 频率计算的时间窗口大小（秒） |
| `frequency.warnDelay` | `30` | 首次警告后，再次触发进入屏蔽的惩罚判定时间阈值（秒） |
| `frequency.blockDur` | `300` | 首次屏蔽的惩罚基础时长（秒） |
| `frequency.whitelist` | `[]` | 免受频率限制的白名单群号列表 |
| **私聊频率控制** | | |
| `frequency.privateEnabled` | `false` | 是否启用私聊频率限制 |
| `frequency.privateLimit` | `10` | 私聊在时间窗口内允许的最大触发次数 |
| `frequency.privateWindow` | `60` | 私聊计算的时间窗口大小（秒） |
| `frequency.privateWarnDelay` | `30` | 私聊警告后再次触发进入屏蔽的时间阈值（秒） |
| `frequency.privateBlockDur` | `300` | 私聊首次屏蔽的惩罚基础时长（秒） |
| `frequency.privateWhitelist` | `[]` | 免受私聊限制的白名单用户 QQ 列表 |
| **惩罚指数与通知** | | |
| `frequency.blockExpBase` | `2` | 屏蔽时长指数增长底数，实际时长 = `blockDur × base^(次数-1)`。设为 `1` 禁用 |
| `frequency.blockExpWindow` | `3600` | 重置惩罚次数的时间窗口（秒），自最后一次屏蔽结束起算 |
| `frequency.blockNotifyCooldown` | `60` | 处于屏蔽状态中再次触发时，发送提示信息的冷却时间（秒），防止频繁复读 |

---

### 4. 申请与邀请审核 (`friend` / `invite`)

| 配置项 | 默认值 | 说明 |
| :--- | :--- | :--- |
| **好友申请** | | |
| `friend.enabled` | `false` | 启用好友申请自管理功能 |
| `friend.autoApprove` | `false` | 自动通过所有好友申请。若设为 `false`，则会发送通知等待管理员审核 |
| `friend.notifyAdminOnApprove` | `true` | 自动同意好友申请后，是否向管理员投递通知 |
| `friend.requestExpireDays` | `7` | 待审核好友申请记录的数据库保留天数 |
| **群聊邀请** | | |
| `invite.enabled` | `false` | 启用群聊邀请审核功能 |
| `invite.autoApprove` | `false` | 自动接受所有群聊邀请。若设为 `false`，则会发送通知等待管理员审核 |
| `invite.notifyAdminOnApprove` | `true` | 自动接受群邀请后，是否向管理员投递通知 |
| `invite.inviteExpireDays` | `3` | 待审核群邀请记录的数据库保留天数 |

---

### 5. 辅助与调试配置 (`botSwitch` / `logging`)

| 配置项 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `botSwitch.enabled` | `true` | 是否启用群聊 Bot 开关功能（通过 `bot-on` / `bot-off` 控制） |
| `botSwitch.defaultState` | `true` | 默认新建群聊或未设置状态群聊的 Bot 开关状态 |
| `logging.verbose` | `false` | 调试模式：开启后输出 debug 日志，并激活 `gc.debug` 调试测试指令 |
| `logging.smallGroupRobotUinRangeMode` | `false` | 小群检测时是否使用号段判定官方机器人（仅在适配器 `is_robot` 字段失效时开启） |

---

### 6. 自定义提示文案 (`messages`)

本插件支持对所有出站通知或提示进行文案定制。

**可用模板变量**（所有文案均共享此变量集）：
- `{groupId}` / `{groupName}`：群号 / 群名
- `{userId}` / `{userName}`：用户 QQ 号 / 用户名称（昵称）
- `{comment}`：好友申请附言
- `{memberCount}` / `{threshold}`：小群当前人数 / 退群人数阈值
- `{duration}`：被禁言的时长（秒）
- `{time}`：频率控制屏蔽的剩余惩罚时长（秒）

> [!WARNING]
> **消息引用解析机制**：
> 当使用回复引用执行 `gc.approve` / `gc.ban` 等指令时，插件是通过匹配通知文案中的 **`群号：`**（识别群）或 **`好友申请` + `QQ：`**（识别好友）字样来自动提取目标 ID 的。
> **在自定义管理员通知文案时，请务必保留上述关键中文字样！**

---

## 💬 指令列表

所有管理员指令统一注册在子指令 `gc` 下，输入 `gc` 即可列出子命令。

### 📌 目标解析说明

在执行 `gc.approve`/`gc.reject`/`gc.ban`/`gc.unban`/`gc.leave`/`gc.sg-add`/`gc.sg-rm`/`gc.del` 时，指令的目标可以通过以下两种方式灵活指定：

1. **直接传参**：`gc.<指令> [号码]`。可使用前缀强制限制作用域，支持：`group:<号码>` (群)、`friend:<号码>` (好友)。简写形式为 `g:`/`f:`、中文 `群:`/`好友:` 均可。如果不带前缀，将根据当前待处理请求自动匹配。
2. **回复引用通知**：直接引用（回复）机器人发送的相应通知消息（只要消息包含目标标识字样），命令后可省略任何参数，插件会自动解析出目标 ID 和所属类型。

---

### 🛠️ 管理员指令 (`gc` 子指令)

主管理员与副管理员均有权使用以下指令：

| 指令 | 说明 | 分类 |
| :--- | :--- | :--- |
| **审核处理** | | |
| `gc.approve [目标]` | 同意待处理的群邀请或好友申请（支持回复引用通知或带前缀的目标参数） | 审核 |
| `gc.reject [目标]` | 拒绝待处理的群邀请或好友申请 | 审核 |
| `gc.pending` | 查看当前所有待处理的请求列表（合并转发发送） | 审核 |
| **黑名单管理** | | |
| `gc.ban [目标]` | 将指定群聊或好友拉黑。拉黑好友时会自动从列表中删除并阻止后续申请 | 黑名单 |
| `gc.unban [目标]` | 解除群聊或好友的黑名单（支持引用“自动拒绝”通知快速拉出黑名单） | 黑名单 |
| `gc.banlist` | 查看当前所有的黑名单列表（合并转发发送） | 黑名单 |
| `gc.clearban` | 清空**群聊**黑名单 | 黑名单 |
| **小群白名单** | | |
| `gc.sg-add [目标]` | 将群加入小群白名单，加入后该群永久免除人数不足自动退群的限制 | 小群 |
| `gc.sg-rm [目标]` | 从小群白名单中移除指定群聊 | 小群 |
| `gc.sg-list` | 查看当前所有的小群白名单列表 | 小群 |
| **好友与群组** | | |
| `gc.friends` | 列出机器人当前的所有好友列表（合并转发发送） | 好友管理 |
| `gc.del [目标]` | 远程删除指定好友（支持引用好友通知） | 好友管理 |
| `gc.groups` | 列出机器人当前加入的所有群聊列表（合并转发发送） | 群组管理 |
| `gc.leave [目标]` | 远程命令机器人退出指定群聊（支持引用群通知） | 群组管理 |

---

### 👥 群内交互指令

以下指令在群聊内直接调用：

| 指令 | 说明 | 默认权限要求 |
| :--- | :--- | :--- |
| `quit` | 命令机器人立即退出当前群聊（可伴随退群提示广播） | 群管理员 / 群主 |
| `bot-on` | 开启机器人在此群的全部功能响应 | 群管理员 / 群主 |
| `bot-off` | 关闭机器人在此群的非管理功能（关闭后Bot保持静音，仅响应管理指令） | 群管理员 / 群主 |

---

## ⚠️ 注意事项

- **适配器限制**：本插件深度依赖 QQ 的特殊接口（如获取陌生人信息、自动处理申请等），目前**仅支持 OneBot 适配器**。
- **通知送达条件**：所有管理员通知默认私聊投递给第 1 个（0号）主管理员。若配置了 `admin.notificationGroupId`，则改投递至该通知群。如果两个都未配置，插件将无法投递任何通知。
- **小群检测与豁免**：
  - 小群自管理只监控**未经审核直接拉入的群**。
  - **通过 `gc.approve` 审核通过的群聊、被管理员（主/副）直接邀请加入的群聊，以及已经加入小群白名单的群聊，均会获得永久豁免。**
  - 当机器人退出群聊后，该群的审核豁免标记会自动清除；若未来该群在未经审核的情况下再次邀请 Bot，它将重新被纳入小群检测。
- **合格小群提醒**：仅在启用 `smallGroupAutoQuit` 时，未经 `gc.approve` 审核而被拉入的人数达标群聊才会触发合格小群管理员提醒。
- **人数精准排除**：小群判定开启 `smallGroupExcludeOfficialBots` 后，只会统计群内的真人（排除 `is_robot` 机器人和 Bot 自己）。插件使用分级短路机制：群人数极其庞大（大于阈值+20）或极其微小（小于阈值）时，直接判定，只在模糊区间拉取一次成员列表，且一旦统计到足够的机器人即提前结束遍历。
- **号段判定模式**：如果使用的适配器 `is_robot` 判定结果不准确，可以启用 `smallGroupRobotUinRangeMode` 强制改用官方机器人号段匹配逻辑作为兜底。
