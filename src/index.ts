import { Context, Schema, segment } from 'koishi'

export const name = 'group-control'

export interface Config {
  // 基础群组管理配置
  welcomeMessage: string
  blacklistMessage: string
  quitMessage: string
  enableBlacklist: boolean
  quitCommandEnabled: boolean
  quitCommandAuthority: number

  // 频率限制相关配置
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

export interface BlacklistedGuild {
  platform: string
  guildId: string
  timestamp: number
  reason: string
}

export interface CommandFrequencyRecord {
  platform: string
  guildId: string
  commandCount: number
  lastCommandTime: number
  warningSent: boolean
  blockExpiryTime: number
  firstWarningTime: number
}

declare module 'koishi' {
  interface Tables {
    blacklisted_guild: BlacklistedGuild
    command_frequency_record: CommandFrequencyRecord
  }
}

export interface GroupConfig {
  welcomeMessage: string
  blacklistMessage: string
  quitMessage: string
  enableBlacklist: boolean
  quitCommandEnabled: boolean
  quitCommandAuthority: number
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

export interface Config {
  basic: GroupConfig
  frequency: FrequencyConfig
  invite: GroupInviteConfig
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    basic: Schema.object({
      welcomeMessage: Schema.string().default('你好，我是机器人。感谢邀请我加入！').description('机器人加入群聊时发送的欢迎消息'),
      blacklistMessage: Schema.string().default('此群聊已被拉黑，机器人将自动退出，请联系管理员移出黑名单。').description('被拉入黑名单群后在群内发送的提示'),
      quitMessage: Schema.string().default('收到来自{userId}的指令，即将退出群聊。').description('用户发送quit指令后在群内发送的提示，支持变量{userId}'),
      enableBlacklist: Schema.boolean().default(true).description('启用"被踢出自动拉黑"功能'),
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
  })
]) as Schema<Config>

function isBlacklistEnabled(config: GroupConfig): string | null {
  if (!config.enableBlacklist) return '黑名单功能未启用。';
  return null;
}

function parseGuildId(input: string): string | null {
  const match = input.trim().match(/^onebot:(\d+)$/);
  return match ? match[1] : (/^\d+$/.test(input.trim()) ? input.trim() : null);
}

const BLACKLIST_PLATFORM = 'onebot';

async function getBlacklistedGuild(ctx: Context, guildId: string) {
  return await ctx.model.get('blacklisted_guild', { platform: BLACKLIST_PLATFORM, guildId });
}

async function removeBlacklistedGuild(ctx: Context, guildId: string) {
  return await ctx.model.remove('blacklisted_guild', { platform: BLACKLIST_PLATFORM, guildId });
}

async function createBlacklistedGuild(ctx: Context, guildId: string, reason: string) {
  return await ctx.model.create('blacklisted_guild', {
    platform: BLACKLIST_PLATFORM,
    guildId,
    timestamp: Math.floor(Date.now() / 1000),
    reason
  });
}

async function getAllBlacklistedGuilds(ctx: Context) {
  return await ctx.model.get('blacklisted_guild', { platform: BLACKLIST_PLATFORM });
}

async function clearBlacklistedGuilds(ctx: Context) {
  return await ctx.model.remove('blacklisted_guild', { platform: BLACKLIST_PLATFORM });
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}

// 频率限制相关
async function getCommandFrequencyRecord(ctx: Context, platform: string, guildId: string) {
  const records = await ctx.model.get('command_frequency_record', { platform, guildId });
  return records.length > 0 ? records[0] : null;
}

async function updateCommandFrequencyRecord(ctx: Context, platform: string, guildId: string, data: Partial<CommandFrequencyRecord>) {
  await ctx.model.upsert('command_frequency_record', [{
    platform,
    guildId,
    ...data
  }]);
}

function isCurrentlyBlocked(record: CommandFrequencyRecord | null): boolean {
  if (!record || !record.blockExpiryTime) return false;
  return Date.now() < record.blockExpiryTime * 1000;
}

export function apply(ctx: Context, config: Config) {
  const quittingGuilds = new Set<string>();

  ctx.model.extend('blacklisted_guild', {
    platform: 'string',
    guildId: 'string',
    timestamp: 'integer',
    reason: 'string',
  }, { primary: ['platform', 'guildId'] })

  ctx.model.extend('command_frequency_record', {
    platform: 'string',
    guildId: 'string',
    commandCount: 'integer',
    lastCommandTime: 'integer',
    warningSent: 'boolean',
    blockExpiryTime: 'integer',
    firstWarningTime: 'integer',
  }, { primary: ['platform', 'guildId'] })

  if (config.invite.enabled) {
    const pendingInvites = new Map<string, { groupId: string, userId: string, userName: string, time: number, flag: string }>();

    // 监听群聊邀请事件
    ctx.on('guild-request', async (session) => {
      // 【关键修复】直接从原始数据获取 ID，避免被 Koishi 截断或映射
      const raw = (session as any).original || (session as any).raw || (session.event as any)?._data || {};

      // 提取 flag
      const flag = raw.flag || (session as any).flag || session.messageId;

      // 提取真实的 user_id 和 group_id (转换为字符串，防止精度丢失)
      const rawUserId = raw.user_id ? String(raw.user_id) : session.userId;
      const rawGroupId = raw.group_id ? String(raw.group_id) : session.guildId;

      const { platform } = session;

      if (!flag && config.invite.showDetailedLog) {
        console.warn('Group Control: 未能提取到邀请 flag，可能导致无法处理邀请。Raw event:', JSON.stringify(raw));
      }

      if (config.invite.showDetailedLog) {
        console.log(`收到群邀请事件 - 原始数据: UserID=${raw.user_id}, GroupID=${raw.group_id}, Flag=${flag}`);
      }

      // 获取邀请者信息
      let userName = rawUserId;
      try {
        const userInfo = await session.bot.getUser(rawUserId);
        userName = userInfo?.nickname || userInfo?.name || rawUserId;
      } catch (error) {
        console.error('获取用户信息失败:', error);
      }

      // 获取群信息
      let groupName = rawGroupId;
      try {
        // 尝试获取群信息，注意这里的 rawGroupId 应该是真实的群号
        const guildInfo = await session.bot.getGuild(rawGroupId) as any;
        groupName = guildInfo?.name || guildInfo?.group_name || rawGroupId;
      } catch (error) {
        console.error('获取群信息失败:', error);
      }

      // 发送等待审核提示给邀请者
      try {
        const waitMessage = config.invite.inviteWaitMessage
          .replace('{groupName}', groupName)
          .replace('{groupId}', rawGroupId)
          .replace('{userName}', userName)
          .replace('{userId}', rawUserId);

        // 【关键修复】强制使用 sendPrivateMessage 确保发私聊
        await session.bot.sendPrivateMessage(rawUserId, waitMessage);
      } catch (error) {
        console.error(`发送等待审核提示给 ${rawUserId} 失败:`, error);
      }

      // 自动同意逻辑
      if (!config.invite.adminQQs || config.invite.adminQQs.length === 0) {
        if (config.invite.autoApprove) {
          try {
            await session.bot.internal.setGroupAddRequest({
              flag: flag,
              sub_type: 'invite',
              approve: true,
              reason: '',
            });
            if (config.invite.showDetailedLog) {
              console.log(`自动同意群聊邀请: 群号 ${rawGroupId}, 邀请者 ${rawUserId}`);
            }
          } catch (error) {
            console.error('自动同意群聊邀请失败:', error);
          }
        }
        return;
      }

      // 存储邀请信息
      const inviteId = `${rawGroupId}_${rawUserId}_${Date.now()}`;
      pendingInvites.set(inviteId, {
        groupId: rawGroupId,
        userId: rawUserId,
        userName: userName,
        time: Date.now(),
        flag: flag
      });

      const requestMessage = config.invite.inviteRequestMessage
        .replace('{groupName}', groupName)
        .replace('{groupId}', rawGroupId)
        .replace('{userName}', userName)
        .replace('{userId}', rawUserId);

      let requestSent = false;

      // 1. 发送到通知群 (使用 sendMessage)
      if (config.invite.notificationGroupId) {
        try {
          await session.bot.sendMessage(config.invite.notificationGroupId, requestMessage);
          requestSent = true;
          if (config.invite.showDetailedLog) {
            console.log(`发送邀请请求到通知群 ${config.invite.notificationGroupId}`);
          }
        } catch (error) {
          console.error(`发送邀请请求到通知群 ${config.invite.notificationGroupId} 失败:`, error);
        }
      }

      // 2. 发送私聊给管理员 (使用 sendPrivateMessage)
      if (!config.invite.notificationGroupId) {
        for (const adminQQ of config.invite.adminQQs) {
          try {
            // 【关键修复】强制使用 sendPrivateMessage
            await session.bot.sendPrivateMessage(adminQQ, requestMessage);
            requestSent = true;

            if (config.invite.showDetailedLog) {
              console.log(`发送邀请请求给管理员 ${adminQQ}`);
            }
          } catch (error) {
            console.error(`发送邀请请求给管理员 ${adminQQ} 失败:`, error);
          }
        }
      }

      if (!requestSent && config.invite.showDetailedLog) {
        console.warn('群邀请请求发送失败：未配置通知群且管理员私聊发送失败');
      }
    });

    // 监听消息以处理管理员审核回复
    ctx.on('message', async (session) => {
      const { userId, content, guildId } = session;

      if (!config.invite.adminQQs.includes(userId)) return;

      const isNotificationGroup = config.invite.notificationGroupId && guildId === config.invite.notificationGroupId;
      const isPrivate = !guildId;

      if (!isNotificationGroup && !isPrivate && config.invite.notificationGroupId) return;

      const hasQuote = session.elements.some(element => element.type === 'quote');
      if (!hasQuote) return;

      const trimmedContent = content.trim();
      if (!['同意', '拒绝', 'accept', 'reject'].includes(trimmedContent)) return;

      const quoteElement = session.elements.find(element => element.type === 'quote');
      if (!quoteElement) return;

      const quoteMessageContent = session.quote?.content || quoteElement.attrs.content || (quoteElement.attrs as any).text || '';
      const groupIdMatch = quoteMessageContent.match(/群号：(\d+)/i);
      const userIdMatch = quoteMessageContent.match(/QQ:\s*(\d+)/i);

      if (groupIdMatch && userIdMatch) {
        const extractedGroupId = groupIdMatch[1];
        const extractedUserId = userIdMatch[1];

        // 查找邀请
        let targetInviteId = null;
        for (const [inviteId, inviteData] of pendingInvites) {
          if (inviteData.groupId === extractedGroupId && inviteData.userId === extractedUserId) {
            targetInviteId = inviteId;
            break;
          }
        }

        if (targetInviteId) {
          const inviteData = pendingInvites.get(targetInviteId);
          if (inviteData) {
            if (trimmedContent === '同意' || trimmedContent === 'accept') {
              try {
                await session.bot.internal.setGroupAddRequest({
                  flag: inviteData.flag,
                  sub_type: 'invite',
                  approve: true,
                  reason: '',
                });

                await session.send(`已同意加入群 ${inviteData.groupId}`);

                // 通知邀请者 (使用 sendPrivateMessage)
                try {
                  await session.bot.sendPrivateMessage(inviteData.userId, `您的群聊邀请已通过管理员审核，机器人已加入群聊。`);
                } catch (error) {
                  console.error('通知邀请者失败:', error);
                }
              } catch (error) {
                console.error('处理同意邀请失败:', error);
                await session.send(`处理同意邀请失败: ${error.message}`);
              }
            } else { // 拒绝
              try {
                await session.bot.internal.setGroupAddRequest({
                  flag: inviteData.flag,
                  sub_type: 'invite',
                  approve: false,
                  reason: '已拒绝',
                });

                await session.send(`已拒绝加入群 ${inviteData.groupId}`);

                // 通知邀请者 (使用 sendPrivateMessage)
                try {
                  await session.bot.sendPrivateMessage(inviteData.userId, `您的群聊邀请未通过管理员审核，机器人将不会加入该群聊。`);
                } catch (error) {
                  console.error('通知邀请者失败:', error);
                }
              } catch (error) {
                console.error('处理拒绝邀请失败:', error);
                await session.send(`处理拒绝邀请失败: ${error.message}`);
              }
            }
            pendingInvites.delete(targetInviteId);
          }
        }
      }
    });
  }

  ctx.on('guild-added', async (session) => {
    const { guildId, platform } = session;
    if (!config.basic.enableBlacklist) {
      if (config.basic.welcomeMessage) {
        try { await session.bot.sendMessage(guildId, config.basic.welcomeMessage, platform); } catch (e) { }
      }
      return;
    }
    const [blacklisted] = await ctx.model.get('blacklisted_guild', { platform, guildId });
    if (blacklisted) {
      try { await session.bot.sendMessage(guildId, config.basic.blacklistMessage, platform); } catch (e) { }
      try { await session.bot.internal.setGroupLeave(parseInt(guildId)); } catch (e) { }
      return;
    }
    if (config.basic.welcomeMessage) {
      try { await session.bot.sendMessage(guildId, config.basic.welcomeMessage, platform); } catch (e) { }
    }
  });

  ctx.on('guild-removed', async (session) => {
    const { guildId, platform } = session;
    if (!config.basic.enableBlacklist) return;
    const quittingKey = `${platform}:${guildId}`;
    if (quittingGuilds.has(quittingKey)) {
      quittingGuilds.delete(quittingKey);
      return;
    }
    await ctx.model.upsert('blacklisted_guild', [{
      platform,
      guildId,
      timestamp: Math.floor(Date.now() / 1000),
      reason: 'kicked'
    }]);
  });

  if (config.frequency.enabled) {
    ctx.on('command/before-execute', async (argv) => {
      const session = argv.session;
      if (!session.guildId || !config.frequency.enabled) return;
      const { guildId, platform } = session;
      if (config.frequency.whitelist && config.frequency.whitelist.includes(guildId)) return;

      let record = await getCommandFrequencyRecord(ctx, platform, guildId);
      const now = Math.floor(Date.now() / 1000);
      const windowStart = now - config.frequency.window;

      if (record && record.lastCommandTime < windowStart) {
        // Window expired
        if (record.warningSent && record.firstWarningTime > 0 && now - record.firstWarningTime <= config.frequency.warnDelay) {
          record.commandCount = 1; record.lastCommandTime = now;
        } else if (isCurrentlyBlocked(record) && Date.now() < record.blockExpiryTime * 1000) {
          // Still blocked
        } else {
          // Reset
          record = { platform, guildId, commandCount: 1, lastCommandTime: now, warningSent: false, blockExpiryTime: 0, firstWarningTime: 0 };
        }
      } else if (!record) {
        record = { platform, guildId, commandCount: 1, lastCommandTime: now, warningSent: false, blockExpiryTime: 0, firstWarningTime: 0 };
      } else {
        record.commandCount += 1;
        record.lastCommandTime = now;
      }

      if (isCurrentlyBlocked(record)) {
        try {
          const remainingTime = Math.ceil((record.blockExpiryTime * 1000 - Date.now()) / 1000);
          await session.bot.sendMessage(guildId, config.frequency.blockedMsg.replace('{time}', remainingTime.toString()), platform);
        } catch (e) { }
        throw new Error('Blocked');
      }

      if (record.commandCount > config.frequency.limit) {
        if (!record.warningSent) {
          try { await session.bot.sendMessage(guildId, config.frequency.warnMsg, platform); } catch (e) { }
          record.warningSent = true; record.commandCount = 1; record.lastCommandTime = now; record.firstWarningTime = now;
          await updateCommandFrequencyRecord(ctx, platform, guildId, record);
          throw new Error('Warning');
        } else {
          record.blockExpiryTime = now + config.frequency.blockDur;
          record.warningSent = false; record.commandCount = 0; record.firstWarningTime = 0;
          await updateCommandFrequencyRecord(ctx, platform, guildId, record);
          try { await session.bot.sendMessage(guildId, config.frequency.blockMsg.replace('{duration}', config.frequency.blockDur.toString()), platform); } catch (e) { }
          throw new Error('Blocked');
        }
      }
      await updateCommandFrequencyRecord(ctx, platform, guildId, record);
    });
  }

  if (config.basic.quitCommandEnabled) {
    ctx.command('quit', '让机器人主动退出当前群聊', { authority: config.basic.quitCommandAuthority })
      .action(async ({ session }) => {
        if (!session.guildId) return 'quit 指令只能在群聊中使用。';
        const { guildId, platform, userId } = session;
        quittingGuilds.add(`${platform}:${guildId}`);
        try { await session.bot.sendMessage(session.guildId, config.basic.quitMessage.replace('{userId}', userId), platform); } catch (e) { }
        try { await session.bot.internal.setGroupLeave(parseInt(guildId)); } catch (e) {
          quittingGuilds.delete(`${platform}:${guildId}`);
          return `退出失败: ${e.message}`;
        }
        return '';
      });
  }

  // 命令部分
  async function viewBlacklist() {
    const errorMsg = isBlacklistEnabled(config.basic); if (errorMsg) return errorMsg;
    const records = await getAllBlacklistedGuilds(ctx);
    if (records.length === 0) return '黑名单为空。';
    return '黑名单列表：\n' + records.map(r => `- ${r.guildId} (时间: ${formatDate(r.timestamp)})`).join('\n');
  }
  ctx.command('view-blacklist', '查看被拉黑的群聊列表', { authority: 4 }).action(viewBlacklist);

  async function removeFromBlacklist({ }, input: string) {
    const errorMsg = isBlacklistEnabled(config.basic); if (errorMsg) return errorMsg;
    const guildId = parseGuildId(input); if (!guildId) return `输入格式错误。`;
    const removed = await removeBlacklistedGuild(ctx, guildId);
    return removed ? `已移除群聊 ${guildId}` : `群聊 ${guildId} 不在黑名单中。`;
  }
  ctx.command('remove-from-blacklist <groupId:text>', '从黑名单移除指定群聊', { authority: 4 }).action(removeFromBlacklist);

  async function addToBlacklist({ }, input: string) {
    const errorMsg = isBlacklistEnabled(config.basic); if (errorMsg) return errorMsg;
    const guildId = parseGuildId(input); if (!guildId) return `输入格式错误。`;
    const existing = await getBlacklistedGuild(ctx, guildId);
    if (existing.length > 0) return `群聊 ${guildId} 已在黑名单中。`;
    await createBlacklistedGuild(ctx, guildId, 'manual_add');
    return `已添加群聊 ${guildId} 到黑名单。`;
  }
  ctx.command('add-to-blacklist <groupId:text>', '手动添加群聊到黑名单', { authority: 4 }).action(addToBlacklist);

  async function clearBlacklist() {
    const errorMsg = isBlacklistEnabled(config.basic); if (errorMsg) return errorMsg;
    const records = await getAllBlacklistedGuilds(ctx);
    if (records.length === 0) return '黑名单已是空的。';
    await clearBlacklistedGuilds(ctx);
    return `已清空黑名单，共移除 ${records.length} 个群聊。`;
  }
  ctx.command('clear-blacklist', '清空黑名单', { authority: 4 }).action(clearBlacklist);
}