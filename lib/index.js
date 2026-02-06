var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  Config: () => Config,
  apply: () => apply,
  name: () => name
});
module.exports = __toCommonJS(src_exports);
var import_koishi = require("koishi");
var name = "group-control";
var Config = import_koishi.Schema.intersect([
  import_koishi.Schema.object({
    basic: import_koishi.Schema.object({
      welcomeMessage: import_koishi.Schema.string().default("你好，我是机器人。感谢邀请我加入！").description("机器人加入群聊时发送的欢迎消息"),
      blacklistMessage: import_koishi.Schema.string().default("此群聊已被拉黑，机器人将自动退出，请联系管理员移出黑名单。").description("被拉入黑名单群后在群内发送的提示"),
      quitMessage: import_koishi.Schema.string().default("收到来自{userId}的指令，即将退出群聊。").description("用户发送quit指令后在群内发送的提示，支持变量{userId}"),
      enableBlacklist: import_koishi.Schema.boolean().default(true).description('启用"被踢出自动拉黑"功能'),
      quitCommandEnabled: import_koishi.Schema.boolean().default(true).description("启用quit"),
      quitCommandAuthority: import_koishi.Schema.number().default(3).description("quit指令所需权限")
    }).description("基础群组管理")
  }),
  import_koishi.Schema.object({
    frequency: import_koishi.Schema.object({
      enabled: import_koishi.Schema.boolean().default(false).description("启用频率控制（对所有指令生效）"),
      limit: import_koishi.Schema.number().default(5).description("时间窗口内允许的最大指令次数"),
      window: import_koishi.Schema.number().default(60).description("频率检测时间窗口（秒）"),
      warnDelay: import_koishi.Schema.number().default(30).description("发出警告后，再次触发的时间阈值（秒），在此时间内再次触发则进入屏蔽状态"),
      blockDur: import_koishi.Schema.number().default(300).description("触发频率限制后屏蔽的时长（秒）"),
      warnMsg: import_koishi.Schema.string().default("指令频率过高，请慢一点~").description("频率过高时发送的警告消息"),
      blockMsg: import_koishi.Schema.string().default("指令频率过高，本群指令已被禁用 {duration} 秒。").description("触发频率限制后发送的屏蔽通知消息，支持变量{duration}"),
      blockedMsg: import_koishi.Schema.string().default("指令暂时被禁用，还有 {time} 秒解禁。").description("屏蔽期间接收到指令时的提示消息，支持变量{time}"),
      whitelist: import_koishi.Schema.array(String).default([]).description("频率控制白名单群号列表，白名单内的群聊不受频率限制")
    }).description("指令频率控制")
  }),
  import_koishi.Schema.object({
    invite: import_koishi.Schema.object({
      enabled: import_koishi.Schema.boolean().default(false).description("启用群聊邀请审核功能"),
      adminQQs: import_koishi.Schema.array(String).default([]).description("管理员QQ号列表（用于权限验证）"),
      notificationGroupId: import_koishi.Schema.string().description("通知群号（可选：若填写，邀请请求将发送到此群；若不填，则发送私聊给管理员）"),
      inviteWaitMessage: import_koishi.Schema.string().default("已收到您的群聊邀请，正在等待管理员审核，请耐心等待。").description("发送给邀请者的等待审核提示消息"),
      inviteRequestMessage: import_koishi.Schema.string().default('收到新的群聊邀请请求：\n群名称：{groupName}\n群号：{groupId}\n邀请者：{userName} (QQ: {userId})\n\n请管理员引用此消息回复"同意"或"拒绝"。').description("发送给管理员的邀请请求消息模板，支持变量{groupName}, {groupId}, {userName}, {userId}"),
      autoApprove: import_koishi.Schema.boolean().default(false).description("是否自动同意邀请（仅在没有指定管理员时）"),
      showDetailedLog: import_koishi.Schema.boolean().default(false).description("是否显示详细日志")
    }).description("群聊邀请审核")
  })
]);
function isBlacklistEnabled(config) {
  if (!config.enableBlacklist) return "黑名单功能未启用。";
  return null;
}
__name(isBlacklistEnabled, "isBlacklistEnabled");
function parseGuildId(input) {
  const match = input.trim().match(/^onebot:(\d+)$/);
  return match ? match[1] : /^\d+$/.test(input.trim()) ? input.trim() : null;
}
__name(parseGuildId, "parseGuildId");
var BLACKLIST_PLATFORM = "onebot";
async function getBlacklistedGuild(ctx, guildId) {
  return await ctx.model.get("blacklisted_guild", { platform: BLACKLIST_PLATFORM, guildId });
}
__name(getBlacklistedGuild, "getBlacklistedGuild");
async function removeBlacklistedGuild(ctx, guildId) {
  return await ctx.model.remove("blacklisted_guild", { platform: BLACKLIST_PLATFORM, guildId });
}
__name(removeBlacklistedGuild, "removeBlacklistedGuild");
async function createBlacklistedGuild(ctx, guildId, reason) {
  return await ctx.model.create("blacklisted_guild", {
    platform: BLACKLIST_PLATFORM,
    guildId,
    timestamp: Math.floor(Date.now() / 1e3),
    reason
  });
}
__name(createBlacklistedGuild, "createBlacklistedGuild");
async function getAllBlacklistedGuilds(ctx) {
  return await ctx.model.get("blacklisted_guild", { platform: BLACKLIST_PLATFORM });
}
__name(getAllBlacklistedGuilds, "getAllBlacklistedGuilds");
async function clearBlacklistedGuilds(ctx) {
  return await ctx.model.remove("blacklisted_guild", { platform: BLACKLIST_PLATFORM });
}
__name(clearBlacklistedGuilds, "clearBlacklistedGuilds");
function formatDate(timestamp) {
  return new Date(timestamp * 1e3).toLocaleString();
}
__name(formatDate, "formatDate");
async function getCommandFrequencyRecord(ctx, platform, guildId) {
  const records = await ctx.model.get("command_frequency_record", { platform, guildId });
  return records.length > 0 ? records[0] : null;
}
__name(getCommandFrequencyRecord, "getCommandFrequencyRecord");
async function updateCommandFrequencyRecord(ctx, platform, guildId, data) {
  await ctx.model.upsert("command_frequency_record", [{
    platform,
    guildId,
    ...data
  }]);
}
__name(updateCommandFrequencyRecord, "updateCommandFrequencyRecord");
function isCurrentlyBlocked(record) {
  if (!record || !record.blockExpiryTime) return false;
  return Date.now() < record.blockExpiryTime * 1e3;
}
__name(isCurrentlyBlocked, "isCurrentlyBlocked");
function apply(ctx, config) {
  const quittingGuilds = /* @__PURE__ */ new Set();
  ctx.model.extend("blacklisted_guild", {
    platform: "string",
    guildId: "string",
    timestamp: "integer",
    reason: "string"
  }, { primary: ["platform", "guildId"] });
  ctx.model.extend("command_frequency_record", {
    platform: "string",
    guildId: "string",
    commandCount: "integer",
    lastCommandTime: "integer",
    warningSent: "boolean",
    blockExpiryTime: "integer",
    firstWarningTime: "integer"
  }, { primary: ["platform", "guildId"] });
  if (config.invite.enabled) {
    const pendingInvites = /* @__PURE__ */ new Map();
    ctx.on("guild-request", async (session) => {
      const raw = session.original || session.raw || session.event?._data || {};
      const flag = raw.flag || session.flag || session.messageId;
      const rawUserId = raw.user_id ? String(raw.user_id) : session.userId;
      const rawGroupId = raw.group_id ? String(raw.group_id) : session.guildId;
      const { platform } = session;
      if (!flag && config.invite.showDetailedLog) {
        console.warn("Group Control: 未能提取到邀请 flag，可能导致无法处理邀请。Raw event:", JSON.stringify(raw));
      }
      if (config.invite.showDetailedLog) {
        console.log(`收到群邀请事件 - 原始数据: UserID=${raw.user_id}, GroupID=${raw.group_id}, Flag=${flag}`);
      }
      let userName = rawUserId;
      try {
        const userInfo = await session.bot.getUser(rawUserId);
        userName = userInfo?.nickname || userInfo?.name || rawUserId;
      } catch (error) {
        console.error("获取用户信息失败:", error);
      }
      let groupName = rawGroupId;
      try {
        const guildInfo = await session.bot.getGuild(rawGroupId);
        groupName = guildInfo?.name || guildInfo?.group_name || rawGroupId;
      } catch (error) {
        console.error("获取群信息失败:", error);
      }
      try {
        const waitMessage = config.invite.inviteWaitMessage.replace("{groupName}", groupName).replace("{groupId}", rawGroupId).replace("{userName}", userName).replace("{userId}", rawUserId);
        await session.bot.sendPrivateMessage(rawUserId, waitMessage);
      } catch (error) {
        console.error(`发送等待审核提示给 ${rawUserId} 失败:`, error);
      }
      if (!config.invite.adminQQs || config.invite.adminQQs.length === 0) {
        if (config.invite.autoApprove) {
          try {
            await session.bot.internal.setGroupAddRequest({
              flag,
              sub_type: "invite",
              approve: true,
              reason: ""
            });
            if (config.invite.showDetailedLog) {
              console.log(`自动同意群聊邀请: 群号 ${rawGroupId}, 邀请者 ${rawUserId}`);
            }
          } catch (error) {
            console.error("自动同意群聊邀请失败:", error);
          }
        }
        return;
      }
      const inviteId = `${rawGroupId}_${rawUserId}_${Date.now()}`;
      pendingInvites.set(inviteId, {
        groupId: rawGroupId,
        userId: rawUserId,
        userName,
        time: Date.now(),
        flag
      });
      const requestMessage = config.invite.inviteRequestMessage.replace("{groupName}", groupName).replace("{groupId}", rawGroupId).replace("{userName}", userName).replace("{userId}", rawUserId);
      let requestSent = false;
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
      if (!config.invite.notificationGroupId) {
        for (const adminQQ of config.invite.adminQQs) {
          try {
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
        console.warn("群邀请请求发送失败：未配置通知群且管理员私聊发送失败");
      }
    });
    ctx.on("message", async (session) => {
      const { userId, content, guildId } = session;
      if (!config.invite.adminQQs.includes(userId)) return;
      const isNotificationGroup = config.invite.notificationGroupId && guildId === config.invite.notificationGroupId;
      const isPrivate = !guildId;
      if (!isNotificationGroup && !isPrivate && config.invite.notificationGroupId) return;
      const hasQuote = session.elements.some((element) => element.type === "quote");
      if (!hasQuote) return;
      const trimmedContent = content.trim();
      if (!["同意", "拒绝", "accept", "reject"].includes(trimmedContent)) return;
      const quoteElement = session.elements.find((element) => element.type === "quote");
      if (!quoteElement) return;
      const quoteMessageContent = session.quote?.content || quoteElement.attrs.content || quoteElement.attrs.text || "";
      const groupIdMatch = quoteMessageContent.match(/群号：(\d+)/i);
      const userIdMatch = quoteMessageContent.match(/QQ:\s*(\d+)/i);
      if (groupIdMatch && userIdMatch) {
        const extractedGroupId = groupIdMatch[1];
        const extractedUserId = userIdMatch[1];
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
            if (trimmedContent === "同意" || trimmedContent === "accept") {
              try {
                await session.bot.internal.setGroupAddRequest({
                  flag: inviteData.flag,
                  sub_type: "invite",
                  approve: true,
                  reason: ""
                });
                await session.send(`已同意加入群 ${inviteData.groupId}`);
                try {
                  await session.bot.sendPrivateMessage(inviteData.userId, `您的群聊邀请已通过管理员审核，机器人已加入群聊。`);
                } catch (error) {
                  console.error("通知邀请者失败:", error);
                }
              } catch (error) {
                console.error("处理同意邀请失败:", error);
                await session.send(`处理同意邀请失败: ${error.message}`);
              }
            } else {
              try {
                await session.bot.internal.setGroupAddRequest({
                  flag: inviteData.flag,
                  sub_type: "invite",
                  approve: false,
                  reason: "已拒绝"
                });
                await session.send(`已拒绝加入群 ${inviteData.groupId}`);
                try {
                  await session.bot.sendPrivateMessage(inviteData.userId, `您的群聊邀请未通过管理员审核，机器人将不会加入该群聊。`);
                } catch (error) {
                  console.error("通知邀请者失败:", error);
                }
              } catch (error) {
                console.error("处理拒绝邀请失败:", error);
                await session.send(`处理拒绝邀请失败: ${error.message}`);
              }
            }
            pendingInvites.delete(targetInviteId);
          }
        }
      }
    });
  }
  ctx.on("guild-added", async (session) => {
    const { guildId, platform } = session;
    if (!config.basic.enableBlacklist) {
      if (config.basic.welcomeMessage) {
        try {
          await session.bot.sendMessage(guildId, config.basic.welcomeMessage, platform);
        } catch (e) {
        }
      }
      return;
    }
    const [blacklisted] = await ctx.model.get("blacklisted_guild", { platform, guildId });
    if (blacklisted) {
      try {
        await session.bot.sendMessage(guildId, config.basic.blacklistMessage, platform);
      } catch (e) {
      }
      try {
        await session.bot.internal.setGroupLeave(parseInt(guildId));
      } catch (e) {
      }
      return;
    }
    if (config.basic.welcomeMessage) {
      try {
        await session.bot.sendMessage(guildId, config.basic.welcomeMessage, platform);
      } catch (e) {
      }
    }
  });
  ctx.on("guild-removed", async (session) => {
    const { guildId, platform } = session;
    if (!config.basic.enableBlacklist) return;
    const quittingKey = `${platform}:${guildId}`;
    if (quittingGuilds.has(quittingKey)) {
      quittingGuilds.delete(quittingKey);
      return;
    }
    await ctx.model.upsert("blacklisted_guild", [{
      platform,
      guildId,
      timestamp: Math.floor(Date.now() / 1e3),
      reason: "kicked"
    }]);
  });
  if (config.frequency.enabled) {
    ctx.on("command/before-execute", async (argv) => {
      const session = argv.session;
      if (!session.guildId || !config.frequency.enabled) return;
      const { guildId, platform } = session;
      if (config.frequency.whitelist && config.frequency.whitelist.includes(guildId)) return;
      let record = await getCommandFrequencyRecord(ctx, platform, guildId);
      const now = Math.floor(Date.now() / 1e3);
      const windowStart = now - config.frequency.window;
      if (record && record.lastCommandTime < windowStart) {
        if (record.warningSent && record.firstWarningTime > 0 && now - record.firstWarningTime <= config.frequency.warnDelay) {
          record.commandCount = 1;
          record.lastCommandTime = now;
        } else if (isCurrentlyBlocked(record) && Date.now() < record.blockExpiryTime * 1e3) {
        } else {
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
          const remainingTime = Math.ceil((record.blockExpiryTime * 1e3 - Date.now()) / 1e3);
          await session.bot.sendMessage(guildId, config.frequency.blockedMsg.replace("{time}", remainingTime.toString()), platform);
        } catch (e) {
        }
        throw new Error("Blocked");
      }
      if (record.commandCount > config.frequency.limit) {
        if (!record.warningSent) {
          try {
            await session.bot.sendMessage(guildId, config.frequency.warnMsg, platform);
          } catch (e) {
          }
          record.warningSent = true;
          record.commandCount = 1;
          record.lastCommandTime = now;
          record.firstWarningTime = now;
          await updateCommandFrequencyRecord(ctx, platform, guildId, record);
          throw new Error("Warning");
        } else {
          record.blockExpiryTime = now + config.frequency.blockDur;
          record.warningSent = false;
          record.commandCount = 0;
          record.firstWarningTime = 0;
          await updateCommandFrequencyRecord(ctx, platform, guildId, record);
          try {
            await session.bot.sendMessage(guildId, config.frequency.blockMsg.replace("{duration}", config.frequency.blockDur.toString()), platform);
          } catch (e) {
          }
          throw new Error("Blocked");
        }
      }
      await updateCommandFrequencyRecord(ctx, platform, guildId, record);
    });
  }
  if (config.basic.quitCommandEnabled) {
    ctx.command("quit", "让机器人主动退出当前群聊", { authority: config.basic.quitCommandAuthority }).action(async ({ session }) => {
      if (!session.guildId) return "quit 指令只能在群聊中使用。";
      const { guildId, platform, userId } = session;
      quittingGuilds.add(`${platform}:${guildId}`);
      try {
        await session.bot.sendMessage(session.guildId, config.basic.quitMessage.replace("{userId}", userId), platform);
      } catch (e) {
      }
      try {
        await session.bot.internal.setGroupLeave(parseInt(guildId));
      } catch (e) {
        quittingGuilds.delete(`${platform}:${guildId}`);
        return `退出失败: ${e.message}`;
      }
      return "";
    });
  }
  async function viewBlacklist() {
    const errorMsg = isBlacklistEnabled(config.basic);
    if (errorMsg) return errorMsg;
    const records = await getAllBlacklistedGuilds(ctx);
    if (records.length === 0) return "黑名单为空。";
    return "黑名单列表：\n" + records.map((r) => `- ${r.guildId} (时间: ${formatDate(r.timestamp)})`).join("\n");
  }
  __name(viewBlacklist, "viewBlacklist");
  ctx.command("view-blacklist", "查看被拉黑的群聊列表", { authority: 4 }).action(viewBlacklist);
  async function removeFromBlacklist({}, input) {
    const errorMsg = isBlacklistEnabled(config.basic);
    if (errorMsg) return errorMsg;
    const guildId = parseGuildId(input);
    if (!guildId) return `输入格式错误。`;
    const removed = await removeBlacklistedGuild(ctx, guildId);
    return removed ? `已移除群聊 ${guildId}` : `群聊 ${guildId} 不在黑名单中。`;
  }
  __name(removeFromBlacklist, "removeFromBlacklist");
  ctx.command("remove-from-blacklist <groupId:text>", "从黑名单移除指定群聊", { authority: 4 }).action(removeFromBlacklist);
  async function addToBlacklist({}, input) {
    const errorMsg = isBlacklistEnabled(config.basic);
    if (errorMsg) return errorMsg;
    const guildId = parseGuildId(input);
    if (!guildId) return `输入格式错误。`;
    const existing = await getBlacklistedGuild(ctx, guildId);
    if (existing.length > 0) return `群聊 ${guildId} 已在黑名单中。`;
    await createBlacklistedGuild(ctx, guildId, "manual_add");
    return `已添加群聊 ${guildId} 到黑名单。`;
  }
  __name(addToBlacklist, "addToBlacklist");
  ctx.command("add-to-blacklist <groupId:text>", "手动添加群聊到黑名单", { authority: 4 }).action(addToBlacklist);
  async function clearBlacklist() {
    const errorMsg = isBlacklistEnabled(config.basic);
    if (errorMsg) return errorMsg;
    const records = await getAllBlacklistedGuilds(ctx);
    if (records.length === 0) return "黑名单已是空的。";
    await clearBlacklistedGuilds(ctx);
    return `已清空黑名单，共移除 ${records.length} 个群聊。`;
  }
  __name(clearBlacklist, "clearBlacklist");
  ctx.command("clear-blacklist", "清空黑名单", { authority: 4 }).action(clearBlacklist);
}
__name(apply, "apply");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Config,
  apply,
  name
});
