var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name8 in all)
    __defProp(target, name8, { get: all[name8], enumerable: true });
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
  apply: () => apply7,
  name: () => name7
});
module.exports = __toCommonJS(src_exports);

// src/database.ts
var database_exports = {};
__export(database_exports, {
  BLACKLIST_PLATFORM: () => BLACKLIST_PLATFORM,
  addToSmallGroupWhitelist: () => addToSmallGroupWhitelist,
  apply: () => apply,
  clearBlacklistedGuilds: () => clearBlacklistedGuilds,
  createBlacklistedGuild: () => createBlacklistedGuild,
  getAllBlacklistedGuilds: () => getAllBlacklistedGuilds,
  getAllSmallGroupWhitelist: () => getAllSmallGroupWhitelist,
  getBlacklistedGuild: () => getBlacklistedGuild,
  getCommandFrequencyRecord: () => getCommandFrequencyRecord,
  getGroupBotStatus: () => getGroupBotStatus,
  isInSmallGroupWhitelist: () => isInSmallGroupWhitelist,
  name: () => name,
  removeBlacklistedGuild: () => removeBlacklistedGuild,
  removeFromSmallGroupWhitelist: () => removeFromSmallGroupWhitelist,
  setGroupBotStatus: () => setGroupBotStatus,
  updateCommandFrequencyRecord: () => updateCommandFrequencyRecord
});
var name = "group-control-database";
function apply(ctx) {
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
  ctx.model.extend("group_bot_status", {
    platform: "string",
    guildId: "string",
    botEnabled: "boolean"
  }, { primary: ["platform", "guildId"] });
  ctx.model.extend("small_group_whitelist", {
    platform: "string",
    guildId: "string"
  }, { primary: ["platform", "guildId"] });
}
__name(apply, "apply");
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
  return await ctx.model.upsert("blacklisted_guild", [{
    platform: BLACKLIST_PLATFORM,
    guildId,
    timestamp: Math.floor(Date.now() / 1e3),
    reason
  }]);
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
async function getGroupBotStatus(ctx, platform, guildId) {
  const records = await ctx.model.get("group_bot_status", { platform, guildId });
  return records.length > 0 ? records[0] : null;
}
__name(getGroupBotStatus, "getGroupBotStatus");
async function setGroupBotStatus(ctx, platform, guildId, botEnabled) {
  await ctx.model.upsert("group_bot_status", [{ platform, guildId, botEnabled }]);
}
__name(setGroupBotStatus, "setGroupBotStatus");
async function isInSmallGroupWhitelist(ctx, guildId) {
  const records = await ctx.model.get("small_group_whitelist", { platform: BLACKLIST_PLATFORM, guildId });
  return records.length > 0;
}
__name(isInSmallGroupWhitelist, "isInSmallGroupWhitelist");
async function addToSmallGroupWhitelist(ctx, guildId) {
  await ctx.model.upsert("small_group_whitelist", [{ platform: BLACKLIST_PLATFORM, guildId }]);
}
__name(addToSmallGroupWhitelist, "addToSmallGroupWhitelist");
async function removeFromSmallGroupWhitelist(ctx, guildId) {
  await ctx.model.remove("small_group_whitelist", { platform: BLACKLIST_PLATFORM, guildId });
}
__name(removeFromSmallGroupWhitelist, "removeFromSmallGroupWhitelist");
async function getAllSmallGroupWhitelist(ctx) {
  return await ctx.model.get("small_group_whitelist", { platform: BLACKLIST_PLATFORM });
}
__name(getAllSmallGroupWhitelist, "getAllSmallGroupWhitelist");

// src/modules/basic.ts
var basic_exports = {};
__export(basic_exports, {
  apply: () => apply2,
  name: () => name2
});

// src/utils.ts
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
function formatDate(timestamp) {
  return new Date(timestamp * 1e3).toLocaleString();
}
__name(formatDate, "formatDate");
async function notifyAdmins(bot, config, message) {
  if (config.invite.notificationGroupId) {
    try {
      await bot.sendMessage(config.invite.notificationGroupId, message);
      return;
    } catch (error) {
      console.error(`发送通知到通知群 ${config.invite.notificationGroupId} 失败:`, error);
    }
  }
  if (config.invite.adminQQs?.length > 0) {
    for (const adminQQ of config.invite.adminQQs) {
      try {
        await bot.sendPrivateMessage(adminQQ, message);
      } catch (error) {
        console.error(`发送通知给管理员 ${adminQQ} 失败:`, error);
      }
    }
  }
}
__name(notifyAdmins, "notifyAdmins");
async function hasPermission(session, config) {
  if (config.permission.mode === "koishi") {
    try {
      const user = session.user;
      if (user && typeof user.authority === "number") {
        return user.authority >= config.permission.koishiAuthority;
      }
    } catch {
    }
    return false;
  }
  const userId = session.userId;
  if (config.invite.adminQQs?.includes(userId)) {
    return true;
  }
  try {
    const member = await session.bot.getGuildMember(session.guildId, userId);
    const roles = member?.roles || member?.role;
    if (roles) {
      if (Array.isArray(roles)) {
        return roles.some((r) => r === "admin" || r === "owner");
      }
      return roles === "admin" || roles === "owner" || roles === "administrator";
    }
    const role = member?.role;
    if (role === "admin" || role === "owner") return true;
  } catch (error) {
    try {
      const info = await session.bot.internal?.getGroupMemberInfo?.(
        parseInt(session.guildId),
        parseInt(userId)
      );
      if (info) {
        return info.role === "admin" || info.role === "owner";
      }
    } catch {
    }
  }
  return false;
}
__name(hasPermission, "hasPermission");
var ADMIN_COMMANDS = /* @__PURE__ */ new Set([
  "bot-on",
  "bot-off",
  "quit",
  "view-blacklist",
  "remove-from-blacklist",
  "add-to-blacklist",
  "clear-blacklist",
  "approve",
  "reject",
  "pending-invites",
  "allow-small-group",
  "disallow-small-group",
  "view-small-group-whitelist"
]);

// src/state.ts
var approvedGroups = /* @__PURE__ */ new Set();

// src/modules/basic.ts
var name2 = "group-control-basic";
async function getGroupName(bot, guildId) {
  try {
    const info = await bot.internal?.getGroupInfo?.(parseInt(guildId));
    if (info?.group_name) return info.group_name;
  } catch {
  }
  try {
    const info = await bot.getGuild(guildId);
    if (info?.name) return info.name;
    if (info?.group_name) return info.group_name;
  } catch {
  }
  return "未知";
}
__name(getGroupName, "getGroupName");
function apply2(ctx, config) {
  const quittingGuilds = /* @__PURE__ */ new Map();
  const processedKicks = /* @__PURE__ */ new Map();
  const QUITTING_EXPIRE_MS = 60 * 1e3;
  const KICK_DEDUP_MS = 60 * 1e3;
  setInterval(() => {
    const now = Date.now();
    for (const [key, time] of quittingGuilds) {
      if (now - time > QUITTING_EXPIRE_MS) quittingGuilds.delete(key);
    }
    for (const [key, time] of processedKicks) {
      if (now - time > KICK_DEDUP_MS) processedKicks.delete(key);
    }
  }, 30 * 1e3);
  ctx.on("guild-added", async (session) => {
    const { guildId, platform } = session;
    if (config.basic.enableBlacklist) {
      const [blacklisted] = await ctx.model.get("blacklisted_guild", { platform, guildId });
      if (blacklisted) {
        try {
          await session.bot.sendMessage(guildId, config.basic.blacklistMessage, platform);
        } catch (e) {
        }
        quittingGuilds.set(`${platform}:${guildId}`, Date.now());
        try {
          await session.bot.internal.setGroupLeave(parseInt(guildId));
        } catch (e) {
        }
        return;
      }
    }
    if (config.basic.smallGroupAutoQuit) {
      const inWhitelist = await isInSmallGroupWhitelist(ctx, guildId);
      const wasApproved = approvedGroups.has(guildId);
      if (wasApproved) approvedGroups.delete(guildId);
      if (inWhitelist || wasApproved) {
      } else {
        const delay = config.basic.smallGroupCheckDelay || 3e3;
        setTimeout(async () => {
          try {
            let memberCount = 0;
            let groupName = "未知";
            try {
              const groupInfo = await session.bot.internal?.getGroupInfo?.(parseInt(guildId));
              memberCount = groupInfo?.member_count || 0;
              if (groupInfo?.group_name) groupName = groupInfo.group_name;
            } catch {
            }
            if (memberCount === 0) {
              try {
                const guildInfo = await session.bot.getGuild(guildId);
                memberCount = guildInfo?.member_count || guildInfo?.memberCount || 0;
                if (guildInfo?.name) groupName = guildInfo.name;
              } catch {
              }
            }
            if (memberCount === 0) {
              try {
                const memberList = await session.bot.getGuildMemberList(guildId);
                memberCount = memberList?.data?.length || 0;
              } catch {
              }
            }
            if (groupName === "未知") {
              groupName = await getGroupName(session.bot, guildId);
            }
            if (memberCount > 0 && memberCount <= config.basic.smallGroupThreshold) {
              const quitMsg = config.basic.smallGroupQuitMessage.replaceAll("{memberCount}", memberCount.toString()).replaceAll("{threshold}", config.basic.smallGroupThreshold.toString()).replaceAll("{groupName}", groupName).replaceAll("{groupId}", guildId);
              try {
                await session.bot.sendMessage(guildId, quitMsg, platform);
              } catch (e) {
              }
              if (config.basic.smallGroupNotifyAdmin) {
                const adminMsg = `小群自动退群
群名称：${groupName}
群号：${guildId}
群成员数：${memberCount}人（阈值：${config.basic.smallGroupThreshold}人）
机器人已自动退出该群。`;
                await notifyAdmins(session.bot, config, adminMsg);
              }
              quittingGuilds.set(`${platform}:${guildId}`, Date.now());
              try {
                await session.bot.internal.setGroupLeave(parseInt(guildId));
              } catch (e) {
                console.error(`小群自动退群失败 (群号: ${guildId}):`, e);
                quittingGuilds.delete(`${platform}:${guildId}`);
              }
            }
          } catch (error) {
            console.error(`小群自动退群检测失败 (群号: ${guildId}):`, error);
          }
        }, delay);
      }
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
    const quittingKey = `${platform}:${guildId}`;
    if (quittingGuilds.has(quittingKey)) {
      return;
    }
    if (processedKicks.has(quittingKey)) {
      return;
    }
    processedKicks.set(quittingKey, Date.now());
    const groupName = await getGroupName(session.bot, guildId);
    if (config.basic.enableBlacklist) {
      await ctx.model.upsert("blacklisted_guild", [{
        platform,
        guildId,
        timestamp: Math.floor(Date.now() / 1e3),
        reason: "kicked"
      }]);
    }
    if (config.basic.notifyAdminOnKick) {
      const kickMsg = config.basic.kickNotificationMessage.replaceAll("{groupId}", guildId).replaceAll("{groupName}", groupName);
      await notifyAdmins(session.bot, config, kickMsg);
    }
  });
  if (config.basic.quitCommandEnabled) {
    const cmdOpts = {};
    if (config.permission.mode === "koishi") {
      cmdOpts.authority = config.permission.koishiAuthority;
    }
    ctx.command("quit", "让机器人主动退出当前群聊", cmdOpts).action(async ({ session }) => {
      if (!session.guildId) return "quit 指令只能在群聊中使用。";
      if (config.permission.mode === "builtin") {
        const hasPerm = await hasPermission(session, config);
        if (!hasPerm) return "权限不足，只有群管理员可以使用此指令。";
      }
      const { guildId, platform, userId } = session;
      const groupName = await getGroupName(session.bot, guildId);
      const adminMsg = `收到来自 ${userId} 的退群指令
群名称：${groupName}
群号：${guildId}`;
      await notifyAdmins(session.bot, config, adminMsg);
      quittingGuilds.set(`${platform}:${guildId}`, Date.now());
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
}
__name(apply2, "apply");

// src/modules/invite.ts
var invite_exports = {};
__export(invite_exports, {
  apply: () => apply3,
  name: () => name3
});
var name3 = "group-control-invite";
function apply3(ctx, config) {
  if (!config.invite.enabled) return;
  const pendingInvites = /* @__PURE__ */ new Map();
  const INVITE_TIMEOUT = 10 * 60 * 1e3;
  setInterval(() => {
    const now = Date.now();
    for (const [key, invite] of pendingInvites) {
      if (now - invite.time > INVITE_TIMEOUT) {
        pendingInvites.delete(key);
        if (config.invite.showDetailedLog) {
          console.log(`邀请超时已清理: 群号=${invite.groupId}, 邀请者=${invite.userId}`);
        }
      }
    }
  }, 60 * 1e3);
  ctx.on("guild-request", async (session) => {
    const raw = session.original || session.raw || session.event?._data || {};
    const flag = raw.flag || session.flag || session.messageId;
    const rawUserId = raw.user_id ? String(raw.user_id) : session.userId;
    const rawGroupId = raw.group_id ? String(raw.group_id) : session.guildId;
    const { platform } = session;
    if (!flag && config.invite.showDetailedLog) {
      console.warn("未能提取到邀请 flag，可能导致无法处理邀请。Raw event:", JSON.stringify(raw));
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
      const waitMessage = config.invite.inviteWaitMessage.replaceAll("{groupName}", groupName).replaceAll("{groupId}", rawGroupId).replaceAll("{userName}", userName).replaceAll("{userId}", rawUserId);
      await session.bot.sendPrivateMessage(rawUserId, waitMessage);
    } catch (error) {
      console.error(`发送等待审核提示给 ${rawUserId} 失败:`, error);
    }
    if (!config.invite.adminQQs || config.invite.adminQQs.length === 0) {
      if (config.invite.autoApprove) {
        try {
          await session.bot.internal.setGroupAddRequest(flag, "invite", true, "");
          approvedGroups.add(rawGroupId);
          if (config.invite.showDetailedLog) {
            console.log(`自动同意群聊邀请: 群号 ${rawGroupId}, 邀请者 ${rawUserId}`);
          }
        } catch (error) {
          console.error("自动同意群聊邀请失败:", error);
        }
      }
      return;
    }
    pendingInvites.set(rawGroupId, {
      groupId: rawGroupId,
      userId: rawUserId,
      userName,
      groupName,
      time: Date.now(),
      flag
    });
    const requestMessage = config.invite.inviteRequestMessage.replaceAll("{groupName}", groupName).replaceAll("{groupId}", rawGroupId).replaceAll("{userName}", userName).replaceAll("{userId}", rawUserId);
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
  ctx.command("approve <groupId:string>", "同意群聊邀请", { authority: 4 }).action(async ({ session }, groupId) => {
    if (!groupId) return "请指定群号。用法：approve <群号>";
    if (!config.invite.adminQQs.includes(session.userId)) {
      return "权限不足，只有管理员可以审核邀请。";
    }
    const inviteData = pendingInvites.get(groupId);
    if (!inviteData) {
      return `未找到群号 ${groupId} 的待处理邀请。当前待处理邀请：${pendingInvites.size > 0 ? Array.from(pendingInvites.values()).map((i) => `${i.groupId}(${i.groupName})`).join(", ") : "无"}`;
    }
    try {
      await session.bot.internal.setGroupAddRequest(inviteData.flag, "invite", true, "");
      approvedGroups.add(groupId);
      try {
        await session.bot.sendPrivateMessage(inviteData.userId, `您的群聊邀请已通过管理员审核，机器人已加入群聊。`);
      } catch (error) {
        console.error("通知邀请者失败:", error);
      }
      pendingInvites.delete(groupId);
      return `已同意加入群 ${groupId}（${inviteData.groupName}），邀请者：${inviteData.userName}`;
    } catch (error) {
      console.error("处理同意邀请失败:", error);
      return `处理同意邀请失败: ${error.message}`;
    }
  });
  ctx.command("reject <groupId:string>", "拒绝群聊邀请", { authority: 4 }).action(async ({ session }, groupId) => {
    if (!groupId) return "请指定群号。用法：reject <群号>";
    if (!config.invite.adminQQs.includes(session.userId)) {
      return "权限不足，只有管理员可以审核邀请。";
    }
    const inviteData = pendingInvites.get(groupId);
    if (!inviteData) {
      return `未找到群号 ${groupId} 的待处理邀请。当前待处理邀请：${pendingInvites.size > 0 ? Array.from(pendingInvites.values()).map((i) => `${i.groupId}(${i.groupName})`).join(", ") : "无"}`;
    }
    try {
      await session.bot.internal.setGroupAddRequest(inviteData.flag, "invite", false, "已拒绝");
      try {
        await session.bot.sendPrivateMessage(inviteData.userId, `您的群聊邀请未通过管理员审核，机器人将不会加入该群聊。`);
      } catch (error) {
        console.error("通知邀请者失败:", error);
      }
      pendingInvites.delete(groupId);
      return `已拒绝加入群 ${groupId}（${inviteData.groupName}），邀请者：${inviteData.userName}`;
    } catch (error) {
      console.error("处理拒绝邀请失败:", error);
      return `处理拒绝邀请失败: ${error.message}`;
    }
  });
  ctx.command("pending-invites", "查看待处理的群聊邀请", { authority: 4 }).action(async ({ session }) => {
    if (!config.invite.adminQQs.includes(session.userId)) {
      return "权限不足，只有管理员可以查看待处理邀请。";
    }
    if (pendingInvites.size === 0) {
      return "当前没有待处理的群聊邀请。";
    }
    const lines = ["待处理的群聊邀请列表："];
    for (const [, invite] of pendingInvites) {
      const elapsed = Math.floor((Date.now() - invite.time) / 1e3 / 60);
      lines.push(`- 群：${invite.groupName}（${invite.groupId}）`);
      lines.push(`  邀请者：${invite.userName}（${invite.userId}）`);
      lines.push(`  ${elapsed} 分钟前`);
      lines.push(`  同意：approve ${invite.groupId} | 拒绝：reject ${invite.groupId}`);
    }
    return lines.join("\n");
  });
}
__name(apply3, "apply");

// src/modules/frequency.ts
var frequency_exports = {};
__export(frequency_exports, {
  apply: () => apply4,
  name: () => name4
});
var name4 = "group-control-frequency";
function isCurrentlyBlocked(record) {
  if (!record || !record.blockExpiryTime) return false;
  return Date.now() < record.blockExpiryTime * 1e3;
}
__name(isCurrentlyBlocked, "isCurrentlyBlocked");
function apply4(ctx, config) {
  if (!config.frequency.enabled) return;
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
__name(apply4, "apply");

// src/modules/commands.ts
var commands_exports = {};
__export(commands_exports, {
  apply: () => apply5,
  name: () => name5
});
var name5 = "group-control-commands";
function apply5(ctx, config) {
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
  ctx.command("allow-small-group <groupId:text>", "解除指定群聊的小群人数限制", { authority: 4 }).action(async ({}, input) => {
    const guildId = parseGuildId(input);
    if (!guildId) return "输入格式错误，请输入群号。";
    const exists = await isInSmallGroupWhitelist(ctx, guildId);
    if (exists) return `群聊 ${guildId} 已在小群白名单中。`;
    await addToSmallGroupWhitelist(ctx, guildId);
    return `已将群聊 ${guildId} 加入小群白名单，该群不再受小群人数限制。`;
  });
  ctx.command("disallow-small-group <groupId:text>", "恢复指定群聊的小群人数限制", { authority: 4 }).action(async ({}, input) => {
    const guildId = parseGuildId(input);
    if (!guildId) return "输入格式错误，请输入群号。";
    const exists = await isInSmallGroupWhitelist(ctx, guildId);
    if (!exists) return `群聊 ${guildId} 不在小群白名单中。`;
    await removeFromSmallGroupWhitelist(ctx, guildId);
    return `已将群聊 ${guildId} 从小群白名单移除，该群将恢复小群人数限制。`;
  });
  ctx.command("view-small-group-whitelist", "查看小群白名单", { authority: 4 }).action(async () => {
    const records = await getAllSmallGroupWhitelist(ctx);
    if (records.length === 0) return "小群白名单为空。";
    return "小群白名单列表（以下群不受小群人数限制）：\n" + records.map((r) => `- ${r.guildId}`).join("\n");
  });
}
__name(apply5, "apply");

// src/modules/switch.ts
var switch_exports = {};
__export(switch_exports, {
  apply: () => apply6,
  name: () => name6
});
var name6 = "group-control-switch";
function apply6(ctx, config) {
  if (config.permission.protectedCommands?.length > 0) {
    const protectedSet = new Set(config.permission.protectedCommands);
    ctx.on("command/before-execute", async (argv) => {
      const session = argv.session;
      if (!session.guildId) return;
      const commandName = argv.command.name;
      if (!protectedSet.has(commandName)) return;
      const hasPerm = await hasPermission(session, config);
      if (!hasPerm) {
        return "权限不足，只有群管理员可以使用此指令。";
      }
    }, true);
  }
  if (!config.botSwitch?.enabled) return;
  const cmdOpts = {};
  if (config.permission.mode === "koishi") {
    cmdOpts.authority = config.permission.koishiAuthority;
  }
  ctx.command("bot-on", "开启机器人", cmdOpts).action(async ({ session }) => {
    if (!session.guildId) return "该指令只能在群聊中使用。";
    if (config.permission.mode === "builtin") {
      const hasPerm = await hasPermission(session, config);
      if (!hasPerm) return "权限不足，只有群管理员可以使用此指令。";
    }
    await setGroupBotStatus(ctx, session.platform, session.guildId, true);
    return "机器人已在此群开启。";
  });
  ctx.command("bot-off", "关闭机器人", cmdOpts).action(async ({ session }) => {
    if (!session.guildId) return "该指令只能在群聊中使用。";
    if (config.permission.mode === "builtin") {
      const hasPerm = await hasPermission(session, config);
      if (!hasPerm) return "权限不足，只有群管理员可以使用此指令。";
    }
    await setGroupBotStatus(ctx, session.platform, session.guildId, false);
    return "机器人已在此群关闭。所有指令和主动响应（入群欢迎、链接解析等）将被阻止。使用 bot-on 重新开启。";
  });
  ctx.on("command/before-execute", async (argv) => {
    const session = argv.session;
    if (!session.guildId) return;
    if (ADMIN_COMMANDS.has(argv.command.name)) {
      return;
    }
    const status = await getGroupBotStatus(ctx, session.platform, session.guildId);
    const isBotEnabled = status ? status.botEnabled : config.botSwitch.defaultState;
    if (!isBotEnabled) {
      const isMentioned = session.elements?.some((e) => e.type === "at" && e.attrs.id === session.bot.userId);
      if (isMentioned && config.botSwitch.disabledMessage) {
        try {
          await session.send(config.botSwitch.disabledMessage);
        } catch (e) {
          ctx.logger("group-control-switch").warn("发送关闭提示失败", e);
        }
      }
      return "";
    }
  }, true);
  ctx.middleware(async (session, next) => {
    if (!session.guildId) return next();
    const status = await getGroupBotStatus(ctx, session.platform, session.guildId);
    const isBotEnabled = status ? status.botEnabled : config.botSwitch.defaultState;
    if (isBotEnabled) {
      return next();
    }
    const isMentioned = session.elements?.some((e) => e.type === "at" && e.attrs.id === session.bot.userId);
    if (isMentioned && config.botSwitch.disabledMessage) {
      try {
        await session.send(config.botSwitch.disabledMessage);
      } catch (e) {
      }
    }
    return;
  }, true);
}
__name(apply6, "apply");

// src/config.ts
var import_koishi = require("koishi");
var Config = import_koishi.Schema.intersect([
  import_koishi.Schema.object({
    permission: import_koishi.Schema.object({
      mode: import_koishi.Schema.union([
        import_koishi.Schema.const("koishi").description("使用 Koishi 自带权限系统 (authority)"),
        import_koishi.Schema.const("builtin").description("使用插件内置权限管理 (群管理员/群主)")
      ]).default("builtin").description("权限管理模式"),
      koishiAuthority: import_koishi.Schema.number().default(3).description("Koishi 模式下，管理指令所需的最低权限等级"),
      protectedCommands: import_koishi.Schema.array(String).default([]).description("需要群管理员权限才能使用的自定义指令名列表（如来自其他插件的指令）")
    }).description("权限管理")
  }),
  import_koishi.Schema.object({
    basic: import_koishi.Schema.object({
      welcomeMessage: import_koishi.Schema.string().default("你好，我是机器人。").description("机器人加入群聊时发送的欢迎消息"),
      blacklistMessage: import_koishi.Schema.string().default("此群聊已被拉黑，机器人将自动退出，请联系管理员移出黑名单。").description("被拉入黑名单群后在群内发送的提示"),
      quitMessage: import_koishi.Schema.string().default("收到来自{userId}的指令，即将退出群聊。").description("用户发送quit指令后在群内发送的提示，支持变量{userId}"),
      enableBlacklist: import_koishi.Schema.boolean().default(true).description('启用"被踢出自动拉黑"功能'),
      quitCommandEnabled: import_koishi.Schema.boolean().default(true).description("启用quit"),
      notifyAdminOnKick: import_koishi.Schema.boolean().default(true).description("被踢出群时通知管理员（需要在群聊邀请审核中配置管理员QQ）"),
      kickNotificationMessage: import_koishi.Schema.string().default("机器人已被踢出群聊\n群名称：{groupName}\n群号：{groupId}\n该群已被自动加入黑名单。").description("被踢出群通知消息模板，支持变量{groupId}, {groupName}"),
      smallGroupAutoQuit: import_koishi.Schema.boolean().default(false).description("启用小群自动退群功能"),
      smallGroupThreshold: import_koishi.Schema.number().default(30).description("小群人数阈值（群成员数小于等于此值时自动退群）"),
      smallGroupQuitMessage: import_koishi.Schema.string().default("该群人数过少（{memberCount}人），不满足最低人数要求（{threshold}人），机器人将自动退出。").description("小群自动退群时在群内发送的提示，支持变量{memberCount}, {threshold}, {groupName}, {groupId}"),
      smallGroupNotifyAdmin: import_koishi.Schema.boolean().default(true).description("小群自动退群时通知管理员"),
      smallGroupCheckDelay: import_koishi.Schema.number().default(3e3).description("小群检测延迟（毫秒），加入群聊后等待一段时间再获取群信息以确保数据准确")
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
      inviteRequestMessage: import_koishi.Schema.string().default("收到新的群聊邀请请求：\n群名称：{groupName}\n群号：{groupId}\n邀请者：{userName} (QQ: {userId})\n\n请管理员使用指令 approve {groupId} 同意或 reject {groupId} 拒绝。").description("发送给管理员的邀请请求消息模板，支持变量{groupName}, {groupId}, {userName}, {userId}"),
      autoApprove: import_koishi.Schema.boolean().default(false).description("是否自动同意邀请（仅在没有指定管理员时）"),
      showDetailedLog: import_koishi.Schema.boolean().default(false).description("是否显示详细日志")
    }).description("群聊邀请审核")
  }),
  import_koishi.Schema.object({
    botSwitch: import_koishi.Schema.object({
      enabled: import_koishi.Schema.boolean().default(true).description("启用独立的群聊bot开关功能"),
      defaultState: import_koishi.Schema.boolean().default(true).description("群聊中的默认开启状态"),
      disabledMessage: import_koishi.Schema.string().default("机器人当前在此群处于关闭状态，请使用bot-on开启。").description("机器人在关闭状态下被@时的提示消息")
    }).description("机器人开关控制")
  })
]);

// src/index.ts
var name7 = "group-control";
function apply7(ctx, config) {
  ctx.plugin(database_exports);
  ctx.plugin(basic_exports, config);
  ctx.plugin(invite_exports, config);
  ctx.plugin(frequency_exports, config);
  ctx.plugin(commands_exports, config);
  ctx.plugin(switch_exports, config);
}
__name(apply7, "apply");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Config,
  apply,
  name
});
