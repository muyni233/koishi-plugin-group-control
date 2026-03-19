var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name9 in all)
    __defProp(target, name9, { get: all[name9], enumerable: true });
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
  apply: () => apply8,
  name: () => name8
});
module.exports = __toCommonJS(src_exports);

// src/database.ts
var database_exports = {};
__export(database_exports, {
  BLACKLIST_PLATFORM: () => BLACKLIST_PLATFORM,
  addPendingFriendRequest: () => addPendingFriendRequest,
  addPendingInvite: () => addPendingInvite,
  addToSmallGroupWhitelist: () => addToSmallGroupWhitelist,
  apply: () => apply,
  clearBlacklistedGuilds: () => clearBlacklistedGuilds,
  clearExpiredPendingFriendRequests: () => clearExpiredPendingFriendRequests,
  clearExpiredPendingInvites: () => clearExpiredPendingInvites,
  createBlacklistedGuild: () => createBlacklistedGuild,
  getAllBlacklistedGuilds: () => getAllBlacklistedGuilds,
  getAllPendingFriendRequests: () => getAllPendingFriendRequests,
  getAllPendingInvites: () => getAllPendingInvites,
  getAllSmallGroupWhitelist: () => getAllSmallGroupWhitelist,
  getBlacklistedGuild: () => getBlacklistedGuild,
  getCommandFrequencyRecord: () => getCommandFrequencyRecord,
  getGroupBotStatus: () => getGroupBotStatus,
  getPendingFriendRequest: () => getPendingFriendRequest,
  getPendingInvite: () => getPendingInvite,
  isInSmallGroupWhitelist: () => isInSmallGroupWhitelist,
  name: () => name,
  removeBlacklistedGuild: () => removeBlacklistedGuild,
  removeFromSmallGroupWhitelist: () => removeFromSmallGroupWhitelist,
  removePendingFriendRequest: () => removePendingFriendRequest,
  removePendingInvite: () => removePendingInvite,
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
    firstWarningTime: "integer",
    blockCount: "integer",
    lastBlockNotifyTime: "integer"
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
  ctx.model.extend("pending_invite", {
    platform: "string",
    groupId: "string",
    userId: "string",
    userName: "string",
    groupName: "string",
    time: "integer",
    flag: "string"
  }, { primary: ["platform", "groupId"] });
  ctx.model.extend("pending_friend_request", {
    platform: "string",
    userId: "string",
    nickname: "string",
    comment: "string",
    flag: "string",
    time: "integer"
  }, { primary: ["platform", "userId"] });
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
async function getPendingInvite(ctx, groupId) {
  const records = await ctx.model.get("pending_invite", { platform: BLACKLIST_PLATFORM, groupId });
  return records.length > 0 ? records[0] : null;
}
__name(getPendingInvite, "getPendingInvite");
async function addPendingInvite(ctx, inviteUser) {
  await ctx.model.upsert("pending_invite", [{ platform: BLACKLIST_PLATFORM, ...inviteUser }]);
}
__name(addPendingInvite, "addPendingInvite");
async function removePendingInvite(ctx, groupId) {
  await ctx.model.remove("pending_invite", { platform: BLACKLIST_PLATFORM, groupId });
}
__name(removePendingInvite, "removePendingInvite");
async function getAllPendingInvites(ctx) {
  return await ctx.model.get("pending_invite", { platform: BLACKLIST_PLATFORM });
}
__name(getAllPendingInvites, "getAllPendingInvites");
async function clearExpiredPendingInvites(ctx, expireTimeMs) {
  const cutoff = Math.floor((Date.now() - expireTimeMs) / 1e3);
  const all = await ctx.model.get("pending_invite", { platform: BLACKLIST_PLATFORM });
  const expired = all.filter((r) => r.time < cutoff);
  for (const record of expired) {
    await ctx.model.remove("pending_invite", { platform: BLACKLIST_PLATFORM, groupId: record.groupId });
  }
  return expired.length;
}
__name(clearExpiredPendingInvites, "clearExpiredPendingInvites");
async function getPendingFriendRequest(ctx, platform, userId) {
  const records = await ctx.model.get("pending_friend_request", { platform, userId });
  return records.length > 0 ? records[0] : null;
}
__name(getPendingFriendRequest, "getPendingFriendRequest");
async function addPendingFriendRequest(ctx, platform, data) {
  await ctx.model.upsert("pending_friend_request", [{ platform, ...data }]);
}
__name(addPendingFriendRequest, "addPendingFriendRequest");
async function removePendingFriendRequest(ctx, platform, userId) {
  await ctx.model.remove("pending_friend_request", { platform, userId });
}
__name(removePendingFriendRequest, "removePendingFriendRequest");
async function getAllPendingFriendRequests(ctx, platform) {
  return await ctx.model.get("pending_friend_request", { platform });
}
__name(getAllPendingFriendRequests, "getAllPendingFriendRequests");
async function clearExpiredPendingFriendRequests(ctx, platform, expireTimeMs) {
  const cutoff = Math.floor((Date.now() - expireTimeMs) / 1e3);
  const all = await ctx.model.get("pending_friend_request", { platform });
  const expired = all.filter((r) => r.time < cutoff);
  for (const record of expired) {
    await ctx.model.remove("pending_friend_request", { platform, userId: record.userId });
  }
  return expired.length;
}
__name(clearExpiredPendingFriendRequests, "clearExpiredPendingFriendRequests");

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
  if (config.admin.notificationGroupId) {
    try {
      await bot.sendMessage(config.admin.notificationGroupId, message);
      return;
    } catch (error) {
      console.error(`发送通知到通知群 ${config.admin.notificationGroupId} 失败:`, error);
    }
  }
  if (config.admin.adminQQs?.length > 0) {
    for (const adminQQ of config.admin.adminQQs) {
      try {
        await bot.sendPrivateMessage(adminQQ, message);
      } catch (error) {
        console.error(`发送通知给管理员 ${adminQQ} 失败:`, error);
      }
    }
  }
}
__name(notifyAdmins, "notifyAdmins");
function isGlobalAdmin(session, config) {
  if (config.permission.mode === "koishi") {
    const user = session.user;
    return typeof user?.authority === "number" && user.authority >= config.permission.koishiAuthority;
  }
  return config.admin.adminQQs?.includes(session.userId) ?? false;
}
__name(isGlobalAdmin, "isGlobalAdmin");
async function isGuildAdmin(session) {
  try {
    const member = await session.bot.getGuildMember(session.guildId, session.userId);
    const role = member?.role;
    if (role === "admin" || role === "owner") return true;
    const roles = member?.roles;
    if (Array.isArray(roles)) return roles.some((r) => r === "admin" || r === "owner");
  } catch {
    try {
      const info = await session.bot.internal?.getGroupMemberInfo?.(
        parseInt(session.guildId),
        parseInt(session.userId)
      );
      if (info?.role === "admin" || info?.role === "owner") return true;
    } catch {
    }
  }
  return false;
}
__name(isGuildAdmin, "isGuildAdmin");
async function hasGuildPermission(session, config) {
  if (config.permission.mode === "koishi") {
    const user = session.user;
    return typeof user?.authority === "number" && user.authority >= config.permission.koishiAuthority;
  }
  if (isGlobalAdmin(session, config)) return true;
  return await isGuildAdmin(session);
}
__name(hasGuildPermission, "hasGuildPermission");
function hasGlobalPermission(session, config) {
  return isGlobalAdmin(session, config);
}
__name(hasGlobalPermission, "hasGlobalPermission");
var ADMIN_COMMANDS = /* @__PURE__ */ new Set([
  "bot-on",
  "bot-off",
  "quit",
  "gc",
  "gc.banlist",
  "gc.unban",
  "gc.ban",
  "gc.clearban",
  "gc.approve",
  "gc.reject",
  "gc.pending",
  "gc.sg-add",
  "gc.sg-rm",
  "gc.sg-list",
  "gc.fp",
  "gc.fa",
  "gc.fr"
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
    ctx.logger("group-control-basic").info(`[guild-added] 触发！guildId=${guildId}, platform=${platform}`);
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
      const pendingInvite = await getPendingInvite(ctx, guildId);
      const hadPendingInvite = !!pendingInvite;
      if (hadPendingInvite) await removePendingInvite(ctx, guildId);
      if (inWhitelist || wasApproved || hadPendingInvite) {
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
            } else if (memberCount > config.basic.smallGroupThreshold) {
              if (config.basic.smallGroupQualifiedNotifyAdmin) {
                const qualifiedMsg = config.basic.smallGroupQualifiedMessage.replaceAll("{groupName}", groupName).replaceAll("{groupId}", guildId).replaceAll("{memberCount}", memberCount.toString()).replaceAll("{threshold}", config.basic.smallGroupThreshold.toString());
                await notifyAdmins(session.bot, config, qualifiedMsg);
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
  if (config.basic.notifyAdminOnMute) {
    ctx.on("guild-member-mute", async (session) => {
      if (session.userId !== session.bot?.userId) return;
      if (!session.duration) return;
      const { guildId, platform } = session;
      const operatorId = session.operatorId || "未知";
      const duration = session.duration ?? 0;
      const groupName = await getGroupName(session.bot, guildId);
      const msg = config.basic.muteNotificationMessage.replaceAll("{groupId}", guildId).replaceAll("{groupName}", groupName).replaceAll("{operatorId}", operatorId).replaceAll("{duration}", duration.toString());
      await notifyAdmins(session.bot, config, msg);
    });
  }
  if (config.basic.quitCommandEnabled) {
    const cmdOpts = {};
    if (config.permission.mode === "koishi") {
      cmdOpts.authority = config.permission.koishiAuthority;
    }
    ctx.command("quit", "让机器人主动退出当前群聊", cmdOpts).action(async ({ session }) => {
      if (!session.guildId) return "quit 指令只能在群聊中使用。";
      if (config.permission.mode === "builtin") {
        const hasPerm = await hasGuildPermission(session, config);
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
  setInterval(async () => {
    const expireMs = config.invite.inviteExpireDays * 24 * 60 * 60 * 1e3;
    try {
      const count = await clearExpiredPendingInvites(ctx, expireMs);
      if (count > 0 && config.invite.showDetailedLog) {
        console.log(`已自动清理 ${count} 个过期邀请`);
      }
    } catch (error) {
      console.error("清理过期邀请失败:", error);
    }
  }, 60 * 60 * 1e3);
  ctx.logger("group-control-invite").info("invite 模块已加载，正在监听 guild-request 事件");
  ctx.on("guild-request", async (session) => {
    ctx.logger("group-control-invite").info(`[guild-request] 触发！userId=${session.userId}, guildId=${session.guildId}, messageId=${session.messageId}, type=${session.type}, subtype=${session.subtype}`);
    ctx.logger("group-control-invite").info(`[guild-request] event 对象: ${JSON.stringify(session.event, null, 2)}`);
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
    if (!config.admin.adminQQs || config.admin.adminQQs.length === 0) {
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
    await addPendingInvite(ctx, {
      groupId: rawGroupId,
      userId: rawUserId,
      userName,
      groupName,
      time: Math.floor(Date.now() / 1e3),
      flag
    });
    const requestMessage = config.invite.inviteRequestMessage.replaceAll("{groupName}", groupName).replaceAll("{groupId}", rawGroupId).replaceAll("{userName}", userName).replaceAll("{userId}", rawUserId);
    let requestSent = false;
    if (config.admin.notificationGroupId) {
      try {
        await session.bot.sendMessage(config.admin.notificationGroupId, requestMessage);
        requestSent = true;
        if (config.invite.showDetailedLog) {
          console.log(`发送邀请请求到通知群 ${config.admin.notificationGroupId}`);
        }
      } catch (error) {
        console.error(`发送邀请请求到通知群 ${config.admin.notificationGroupId} 失败:`, error);
      }
    }
    if (!config.admin.notificationGroupId) {
      for (const adminQQ of config.admin.adminQQs) {
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
  ctx.command("gc.approve <groupId:string>", "同意群聊邀请").action(async ({ session }, groupId) => {
    if (!groupId) return "请指定群号。用法：gc.approve <群号>";
    if (!hasGlobalPermission(session, config)) return "权限不足，只有管理员可以审核邀请。";
    const inviteData = await getPendingInvite(ctx, groupId);
    if (!inviteData) {
      const allInvites = await getAllPendingInvites(ctx);
      return `未找到群号 ${groupId} 的待处理邀请。当前待处理邀请：${allInvites.length > 0 ? allInvites.map((i) => `${i.groupId}(${i.groupName})`).join(", ") : "无"}`;
    }
    try {
      await session.bot.internal.setGroupAddRequest(inviteData.flag, "invite", true, "");
      approvedGroups.add(groupId);
      try {
        await session.bot.sendPrivateMessage(inviteData.userId, `您的群聊邀请已通过管理员审核，机器人已加入群聊。`);
      } catch (error) {
        console.error("通知邀请者失败:", error);
      }
      await removePendingInvite(ctx, groupId);
      return `已同意加入群 ${groupId}（${inviteData.groupName}），邀请者：${inviteData.userName}`;
    } catch (error) {
      console.error("处理同意邀请失败:", error);
      return `处理同意邀请失败: ${error.message}`;
    }
  });
  ctx.command("gc.reject <groupId:string>", "拒绝群聊邀请").action(async ({ session }, groupId) => {
    if (!groupId) return "请指定群号。用法：gc.reject <群号>";
    if (!hasGlobalPermission(session, config)) return "权限不足，只有管理员可以审核邀请。";
    const inviteData = await getPendingInvite(ctx, groupId);
    if (!inviteData) {
      const allInvites = await getAllPendingInvites(ctx);
      return `未找到群号 ${groupId} 的待处理邀请。当前待处理邀请：${allInvites.length > 0 ? allInvites.map((i) => `${i.groupId}(${i.groupName})`).join(", ") : "无"}`;
    }
    try {
      await session.bot.internal.setGroupAddRequest(inviteData.flag, "invite", false, "已拒绝");
      try {
        await session.bot.sendPrivateMessage(inviteData.userId, `您的群聊邀请未通过管理员审核，机器人将不会加入该群聊。`);
      } catch (error) {
        console.error("通知邀请者失败:", error);
      }
      await removePendingInvite(ctx, groupId);
      return `已拒绝加入群 ${groupId}（${inviteData.groupName}），邀请者：${inviteData.userName}`;
    } catch (error) {
      console.error("处理拒绝邀请失败:", error);
      return `处理拒绝邀请失败: ${error.message}`;
    }
  });
  ctx.command("gc.pending", "查看待处理的群聊邀请").action(async ({ session }) => {
    if (!config.admin.adminQQs.includes(session.userId)) {
      return "权限不足，只有管理员可以查看待处理邀请。";
    }
    const allInvites = await getAllPendingInvites(ctx);
    if (allInvites.length === 0) {
      return "当前没有待处理的群聊邀请。";
    }
    const lines = ["待处理的群聊邀请列表："];
    for (const invite of allInvites) {
      const elapsed = Math.floor((Date.now() / 1e3 - invite.time) / 60);
      lines.push(`- 群：${invite.groupName}（${invite.groupId}）`);
      lines.push(`  邀请者：${invite.userName}（${invite.userId}）`);
      lines.push(`  ${elapsed} 分钟前`);
      lines.push(`  同意：gc.approve ${invite.groupId} | 拒绝：gc.reject ${invite.groupId}`);
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
var PRIVATE_GUILD_PREFIX = "__private__:";
function isBlocked(record) {
  if (!record || !record.blockExpiryTime) return false;
  return Date.now() < record.blockExpiryTime * 1e3;
}
__name(isBlocked, "isBlocked");
function calcBlockDur(baseDur, expBase, blockCount) {
  if (expBase <= 1) return baseDur;
  return Math.round(baseDur * Math.pow(expBase, blockCount - 1));
}
__name(calcBlockDur, "calcBlockDur");
function makeEmptyRecord(platform, guildId, now) {
  return { platform, guildId, commandCount: 1, lastCommandTime: now, warningSent: false, blockExpiryTime: 0, firstWarningTime: 0, blockCount: 0, lastBlockNotifyTime: 0 };
}
__name(makeEmptyRecord, "makeEmptyRecord");
async function handleTrigger(ctx, platform, guildId, limit, window, warnDelay, baseDur, expBase, expWindow, notifyCooldown) {
  let record = await getCommandFrequencyRecord(ctx, platform, guildId);
  const now = Math.floor(Date.now() / 1e3);
  const windowStart = now - window;
  if (!record) {
    record = makeEmptyRecord(platform, guildId, now);
  } else if (record.lastCommandTime < windowStart) {
    if (isBlocked(record)) {
    } else {
      const blockExpired = record.blockExpiryTime > 0 && now - record.blockExpiryTime > expWindow;
      record.commandCount = 1;
      record.lastCommandTime = now;
      record.warningSent = false;
      record.firstWarningTime = 0;
      if (blockExpired) record.blockCount = 0;
    }
  } else {
    record.commandCount += 1;
    record.lastCommandTime = now;
  }
  if (isBlocked(record)) {
    const remaining = Math.ceil((record.blockExpiryTime * 1e3 - Date.now()) / 1e3);
    const lastNotify = record.lastBlockNotifyTime || 0;
    if (now - lastNotify >= notifyCooldown) {
      record.lastBlockNotifyTime = now;
      await updateCommandFrequencyRecord(ctx, platform, guildId, record);
      return { result: "blocked", remaining };
    } else {
      await updateCommandFrequencyRecord(ctx, platform, guildId, record);
      return { result: "blocked-silent" };
    }
  }
  if (record.commandCount > limit) {
    if (!record.warningSent) {
      record.warningSent = true;
      record.commandCount = 1;
      record.lastCommandTime = now;
      record.firstWarningTime = now;
      await updateCommandFrequencyRecord(ctx, platform, guildId, record);
      return { result: "warn" };
    } else {
      record.blockCount = (record.blockCount || 0) + 1;
      const dur = calcBlockDur(baseDur, expBase, record.blockCount);
      record.blockExpiryTime = now + dur;
      record.warningSent = false;
      record.commandCount = 0;
      record.firstWarningTime = 0;
      record.lastBlockNotifyTime = now;
      await updateCommandFrequencyRecord(ctx, platform, guildId, record);
      return { result: "new-blocked", dur };
    }
  }
  await updateCommandFrequencyRecord(ctx, platform, guildId, record);
  return { result: "ok" };
}
__name(handleTrigger, "handleTrigger");
function isSystemSession(session) {
  if (!session.userId) return true;
  if (session.userId === session.bot?.userId) return true;
  return false;
}
__name(isSystemSession, "isSystemSession");
function isUserInitiatedNonCommand(session) {
  if (!session.content) return false;
  const mentioned = session.elements?.some((e) => e.type === "at" && e.attrs?.id === session.bot?.userId);
  if (mentioned) return true;
  if (!session.guildId) return true;
  return false;
}
__name(isUserInitiatedNonCommand, "isUserInitiatedNonCommand");
function apply4(ctx, config) {
  const freq = config.frequency;
  if (!freq.enabled && !freq.privateEnabled) return;
  async function checkFrequency(session, isCommand) {
    const isPrivate = !session.guildId;
    const platform = session.platform;
    if (isPrivate) {
      if (!freq.privateEnabled) return true;
      if (freq.privateWhitelist?.includes(session.userId)) return true;
      const guildId = PRIVATE_GUILD_PREFIX + session.userId;
      const r = await handleTrigger(
        ctx,
        platform,
        guildId,
        freq.privateLimit,
        freq.privateWindow,
        freq.privateWarnDelay,
        freq.privateBlockDur,
        freq.blockExpBase,
        freq.blockExpWindow,
        freq.blockNotifyCooldown
      );
      if (r.result === "ok") return true;
      if (r.result === "warn") {
        try {
          await session.send(freq.warnMsg);
        } catch (e) {
        }
        return false;
      }
      if (r.result === "new-blocked") {
        try {
          await session.send(freq.blockMsg.replace("{duration}", r.dur.toString()));
        } catch (e) {
        }
        return false;
      }
      if (r.result === "blocked") {
        try {
          await session.send(freq.blockedMsg.replace("{time}", r.remaining.toString()));
        } catch (e) {
        }
        return false;
      }
      return false;
    } else {
      if (!freq.enabled) return true;
      if (freq.whitelist?.includes(session.guildId)) return true;
      const { guildId } = session;
      const r = await handleTrigger(
        ctx,
        platform,
        guildId,
        freq.limit,
        freq.window,
        freq.warnDelay,
        freq.blockDur,
        freq.blockExpBase,
        freq.blockExpWindow,
        freq.blockNotifyCooldown
      );
      if (r.result === "ok") return true;
      if (r.result === "warn") {
        try {
          await session.bot.sendMessage(guildId, freq.warnMsg, platform);
        } catch (e) {
        }
        return false;
      }
      if (r.result === "new-blocked") {
        try {
          await session.bot.sendMessage(guildId, freq.blockMsg.replace("{duration}", r.dur.toString()), platform);
        } catch (e) {
        }
        return false;
      }
      if (r.result === "blocked") {
        try {
          await session.bot.sendMessage(guildId, freq.blockedMsg.replace("{time}", r.remaining.toString()), platform);
        } catch (e) {
        }
        return false;
      }
      return false;
    }
  }
  __name(checkFrequency, "checkFrequency");
  ctx.on("command/before-execute", async (argv) => {
    const session = argv.session;
    if (isSystemSession(session)) return;
    const allowed = await checkFrequency(session, true);
    if (!allowed) throw new Error("Blocked");
  });
  ctx.middleware(async (session, next) => {
    if (isSystemSession(session)) return next();
    if (!isUserInitiatedNonCommand(session)) return next();
    const allowed = await checkFrequency(session, false);
    if (!allowed) return;
    return next();
  }, true);
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
  ctx.command("gc", "群控管理员指令");
  ctx.command("gc.ban <groupId:text>", "添加群聊到黑名单").action(async ({ session }, input) => {
    if (!hasGlobalPermission(session, config)) return "权限不足，只有全局管理员可以执行此操作。";
    const errorMsg = isBlacklistEnabled(config.basic);
    if (errorMsg) return errorMsg;
    const guildId = parseGuildId(input);
    if (!guildId) return `输入格式错误。`;
    const existing = await getBlacklistedGuild(ctx, guildId);
    if (existing.length > 0) return `群聊 ${guildId} 已在黑名单中。`;
    await createBlacklistedGuild(ctx, guildId, "manual_add");
    return `已添加群聊 ${guildId} 到黑名单。`;
  });
  ctx.command("gc.unban <groupId:text>", "从黑名单移除群聊").action(async ({ session }, input) => {
    if (!hasGlobalPermission(session, config)) return "权限不足，只有全局管理员可以执行此操作。";
    const errorMsg = isBlacklistEnabled(config.basic);
    if (errorMsg) return errorMsg;
    const guildId = parseGuildId(input);
    if (!guildId) return `输入格式错误。`;
    const removed = await removeBlacklistedGuild(ctx, guildId);
    return removed ? `已移除群聊 ${guildId}` : `群聊 ${guildId} 不在黑名单中。`;
  });
  ctx.command("gc.banlist", "查看黑名单").action(async ({ session }) => {
    if (!hasGlobalPermission(session, config)) return "权限不足，只有全局管理员可以执行此操作。";
    const errorMsg = isBlacklistEnabled(config.basic);
    if (errorMsg) return errorMsg;
    const records = await getAllBlacklistedGuilds(ctx);
    if (records.length === 0) return "黑名单为空。";
    return "黑名单列表：\n" + records.map((r) => `- ${r.guildId} (时间: ${formatDate(r.timestamp)})`).join("\n");
  });
  ctx.command("gc.clearban", "清空黑名单").action(async ({ session }) => {
    if (!hasGlobalPermission(session, config)) return "权限不足，只有全局管理员可以执行此操作。";
    const errorMsg = isBlacklistEnabled(config.basic);
    if (errorMsg) return errorMsg;
    const records = await getAllBlacklistedGuilds(ctx);
    if (records.length === 0) return "黑名单已是空的。";
    await clearBlacklistedGuilds(ctx);
    return `已清空黑名单，共移除 ${records.length} 个群聊。`;
  });
  ctx.command("gc.sg-add <groupId:text>", "解除指定群聊的小群人数限制").action(async ({ session }, input) => {
    if (!hasGlobalPermission(session, config)) return "权限不足，只有全局管理员可以执行此操作。";
    const guildId = parseGuildId(input);
    if (!guildId) return "输入格式错误，请输入群号。";
    const exists = await isInSmallGroupWhitelist(ctx, guildId);
    if (exists) return `群聊 ${guildId} 已在小群白名单中。`;
    await addToSmallGroupWhitelist(ctx, guildId);
    return `已将群聊 ${guildId} 加入小群白名单，该群不再受小群人数限制。`;
  });
  ctx.command("gc.sg-rm <groupId:text>", "恢复指定群聊的小群人数限制").action(async ({ session }, input) => {
    if (!hasGlobalPermission(session, config)) return "权限不足，只有全局管理员可以执行此操作。";
    const guildId = parseGuildId(input);
    if (!guildId) return "输入格式错误，请输入群号。";
    const exists = await isInSmallGroupWhitelist(ctx, guildId);
    if (!exists) return `群聊 ${guildId} 不在小群白名单中。`;
    await removeFromSmallGroupWhitelist(ctx, guildId);
    return `已将群聊 ${guildId} 从小群白名单移除，该群将恢复小群人数限制。`;
  });
  ctx.command("gc.sg-list", "查看小群白名单").action(async ({ session }) => {
    if (!hasGlobalPermission(session, config)) return "权限不足，只有全局管理员可以执行此操作。";
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
      const hasPerm = await hasGuildPermission(session, config);
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
      const hasPerm = await hasGuildPermission(session, config);
      if (!hasPerm) return "权限不足，只有群管理员可以使用此指令。";
    }
    await setGroupBotStatus(ctx, session.platform, session.guildId, true);
    return "机器人已在此群开启。";
  });
  ctx.command("bot-off", "关闭机器人", cmdOpts).action(async ({ session }) => {
    if (!session.guildId) return "该指令只能在群聊中使用。";
    if (config.permission.mode === "builtin") {
      const hasPerm = await hasGuildPermission(session, config);
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

// src/modules/friend.ts
var friend_exports = {};
__export(friend_exports, {
  apply: () => apply7,
  name: () => name7
});
var name7 = "group-control-friend";
function apply7(ctx, config) {
  if (!config.friend.enabled) return;
  setInterval(async () => {
    const expireMs = config.friend.requestExpireDays * 24 * 60 * 60 * 1e3;
    try {
      for (const bot of ctx.bots) {
        await clearExpiredPendingFriendRequests(ctx, bot.platform, expireMs);
      }
    } catch (e) {
    }
  }, 60 * 60 * 1e3);
  ctx.on("friend-request", async (session) => {
    const raw = session.original || session.raw || session.event?._data || {};
    const flag = raw.flag || session.flag || session.messageId;
    const userId = raw.user_id ? String(raw.user_id) : session.userId;
    const comment = raw.comment || session.comment || "";
    const { platform } = session;
    let nickname = userId;
    try {
      const info = await session.bot.internal?.getStrangerInfo?.(parseInt(userId));
      nickname = info?.nickname || nickname;
    } catch (e) {
    }
    if (config.friend.autoApprove) {
      try {
        await session.bot.internal?.setFriendAddRequest?.(flag, true, "");
        if (config.friend.notifyAdminOnApprove) {
          const msg2 = config.friend.approveNotificationMessage.replaceAll("{userId}", userId).replaceAll("{nickname}", nickname).replaceAll("{comment}", comment);
          await notifyAdmins(session.bot, config, msg2);
        }
      } catch (e) {
        ctx.logger("group-control-friend").warn("自动通过好友申请失败", e);
      }
      return;
    }
    await addPendingFriendRequest(ctx, platform, { userId, nickname, comment, flag, time: Math.floor(Date.now() / 1e3) });
    const msg = config.friend.requestMessage.replaceAll("{userId}", userId).replaceAll("{nickname}", nickname).replaceAll("{comment}", comment);
    await notifyAdmins(session.bot, config, msg);
  });
  ctx.command("gc.fp", "查看待处理的好友申请").action(async ({ session }) => {
    if (!hasGlobalPermission(session, config)) return "权限不足。";
    const all = await getAllPendingFriendRequests(ctx, session.platform);
    if (all.length === 0) return "当前没有待处理的好友申请。";
    const lines = ["待处理好友申请列表："];
    for (const r of all) {
      const elapsed = Math.floor((Date.now() / 1e3 - r.time) / 60);
      lines.push(`- ${r.nickname}（${r.userId}）附言：${r.comment || "无"} · ${elapsed} 分钟前`);
      lines.push(`  同意：gc.fa ${r.userId} | 拒绝：gc.fr ${r.userId}`);
    }
    return lines.join("\n");
  });
  ctx.command("gc.fa <userId:string>", "同意好友申请").action(async ({ session }, userId) => {
    if (!hasGlobalPermission(session, config)) return "权限不足。";
    if (!userId) return "请指定QQ号。用法：gc.fa <QQ号>";
    const record = await getPendingFriendRequest(ctx, session.platform, userId);
    if (!record) return `未找到来自 ${userId} 的待处理好友申请。`;
    try {
      await session.bot.internal?.setFriendAddRequest?.(record.flag, true, "");
      await removePendingFriendRequest(ctx, session.platform, userId);
      return `已同意 ${record.nickname}（${userId}）的好友申请。`;
    } catch (e) {
      return `处理失败：${e.message}`;
    }
  });
  ctx.command("gc.fr <userId:string>", "拒绝好友申请").action(async ({ session }, userId) => {
    if (!hasGlobalPermission(session, config)) return "权限不足。";
    if (!userId) return "请指定QQ号。用法：gc.fr <QQ号>";
    const record = await getPendingFriendRequest(ctx, session.platform, userId);
    if (!record) return `未找到来自 ${userId} 的待处理好友申请。`;
    try {
      await session.bot.internal?.setFriendAddRequest?.(record.flag, false, "");
      await removePendingFriendRequest(ctx, session.platform, userId);
      return `已拒绝 ${record.nickname}（${userId}）的好友申请。`;
    } catch (e) {
      return `处理失败：${e.message}`;
    }
  });
}
__name(apply7, "apply");

// src/config.ts
var import_koishi = require("koishi");
var Config = import_koishi.Schema.intersect([
  import_koishi.Schema.object({
    admin: import_koishi.Schema.object({
      adminQQs: import_koishi.Schema.array(String).default([]).description("管理员QQ号列表（权限验证及通知）"),
      notificationGroupId: import_koishi.Schema.string().description("通知群号（填写后发到此群，否则私聊管理员）")
    }).description("管理员配置")
  }),
  import_koishi.Schema.object({
    permission: import_koishi.Schema.object({
      mode: import_koishi.Schema.union([
        import_koishi.Schema.const("koishi").description("使用 Koishi 自带权限系统 (authority)"),
        import_koishi.Schema.const("builtin").description("使用插件内置权限管理 (群管理员/群主)")
      ]).default("builtin").description("权限管理模式"),
      koishiAuthority: import_koishi.Schema.number().default(3).description("Koishi 模式下管理指令所需的最低权限等级"),
      protectedCommands: import_koishi.Schema.array(String).default([]).description("需要群管理员权限才能使用的自定义指令名列表")
    }).description("权限管理")
  }),
  import_koishi.Schema.object({
    basic: import_koishi.Schema.object({
      welcomeMessage: import_koishi.Schema.string().default("你好，我是机器人。").description("加入群聊时发送的欢迎消息"),
      quitCommandEnabled: import_koishi.Schema.boolean().default(true).description("启用 quit 指令"),
      quitMessage: import_koishi.Schema.string().default("收到来自{userId}的指令，即将退出群聊。").description("quit 指令触发后的群内提示，支持变量 {userId}"),
      enableBlacklist: import_koishi.Schema.boolean().default(true).description("启用被踢出自动拉黑"),
      blacklistMessage: import_koishi.Schema.string().default("此群聊已被拉黑，机器人将自动退出，请联系管理员移出黑名单。").description("被拉入黑名单群后的提示"),
      notifyAdminOnKick: import_koishi.Schema.boolean().default(true).description("被踢出群时通知管理员"),
      kickNotificationMessage: import_koishi.Schema.string().default("机器人已被踢出群聊\n群名称：{groupName}\n群号：{groupId}\n该群已被自动加入黑名单。").description("被踢出群通知模板，支持变量 {groupId}, {groupName}"),
      smallGroupAutoQuit: import_koishi.Schema.boolean().default(false).description("启用小群自动退群"),
      smallGroupThreshold: import_koishi.Schema.number().default(30).description("小群人数阈值（低于等于此值时自动退群）"),
      smallGroupCheckDelay: import_koishi.Schema.number().default(3e3).description("加入后延迟检测时间（毫秒）"),
      smallGroupQuitMessage: import_koishi.Schema.string().default("该群人数过少（{memberCount}人），不满足最低人数要求（{threshold}人），机器人将自动退出。").description("小群退群提示，支持变量 {memberCount}, {threshold}, {groupName}, {groupId}"),
      smallGroupNotifyAdmin: import_koishi.Schema.boolean().default(true).description("小群自动退群时通知管理员"),
      smallGroupQualifiedNotifyAdmin: import_koishi.Schema.boolean().default(true).description("未经审核被拉入人数达标的群时通知管理员"),
      smallGroupQualifiedMessage: import_koishi.Schema.string().default("机器人被未经审核地拉入群聊\n群名称：{groupName}\n群号：{groupId}\n当前人数：{memberCount}人（阈值：{threshold}人）\n请确认是否保留。").description("合格小群通知模板，支持变量 {groupName}, {groupId}, {memberCount}, {threshold}"),
      notifyAdminOnMute: import_koishi.Schema.boolean().default(false).description("机器人被禁言时通知管理员"),
      muteNotificationMessage: import_koishi.Schema.string().default("机器人在群聊中被禁言\n群名称：{groupName}\n群号：{groupId}\n操作者：{operatorId}\n禁言时长：{duration}秒").description("被禁言通知模板，支持变量 {groupId}, {groupName}, {operatorId}, {duration}")
    }).description("基础群组管理")
  }),
  import_koishi.Schema.object({
    invite: import_koishi.Schema.object({
      enabled: import_koishi.Schema.boolean().default(false).description("启用群聊邀请审核"),
      autoApprove: import_koishi.Schema.boolean().default(false).description("自动同意邀请（仅在未指定管理员时生效）"),
      inviteWaitMessage: import_koishi.Schema.string().default("已收到您的群聊邀请，正在等待管理员审核，请耐心等待。").description("发给邀请者的等待提示"),
      inviteRequestMessage: import_koishi.Schema.string().default("收到新的群聊邀请请求：\n群名称：{groupName}\n群号：{groupId}\n邀请者：{userName} (QQ: {userId})\n\n请使用指令 gc.approve {groupId} 同意或 gc.reject {groupId} 拒绝。").description("发给管理员的请求消息模板，支持变量 {groupName}, {groupId}, {userName}, {userId}"),
      inviteExpireDays: import_koishi.Schema.number().default(3).description("邀请记录过期天数"),
      showDetailedLog: import_koishi.Schema.boolean().default(false).description("显示详细日志")
    }).description("群聊邀请审核")
  }),
  import_koishi.Schema.object({
    friend: import_koishi.Schema.object({
      enabled: import_koishi.Schema.boolean().default(false).description("启用好友申请管理"),
      autoApprove: import_koishi.Schema.boolean().default(false).description("自动通过好友申请（否则通知管理员手动处理）"),
      notifyAdminOnApprove: import_koishi.Schema.boolean().default(true).description("自动通过时是否仍通知管理员"),
      requestExpireDays: import_koishi.Schema.number().default(7).description("待处理申请的过期天数"),
      requestMessage: import_koishi.Schema.string().default("收到新的好友申请\nQQ：{userId}\n昵称：{nickname}\n附言：{comment}\n\n使用 gc.fa {userId} 同意或 gc.fr {userId} 拒绝。").description("通知管理员的消息模板，支持变量 {userId}, {nickname}, {comment}"),
      approveNotificationMessage: import_koishi.Schema.string().default("已自动通过好友申请\nQQ：{userId}\n昵称：{nickname}\n附言：{comment}").description("自动通过时的通知模板，支持变量 {userId}, {nickname}, {comment}")
    }).description("好友申请管理")
  }),
  import_koishi.Schema.object({
    frequency: import_koishi.Schema.object({
      enabled: import_koishi.Schema.boolean().default(false).description("启用群聊频率控制（指令及 @ 对话均受限）"),
      limit: import_koishi.Schema.number().default(5).description("群聊：时间窗口内允许的最大触发次数"),
      window: import_koishi.Schema.number().default(60).description("群聊：时间窗口（秒）"),
      warnDelay: import_koishi.Schema.number().default(30).description("群聊：警告后再次触发的时间阈值（秒），超出则进入屏蔽"),
      blockDur: import_koishi.Schema.number().default(300).description("群聊：首次屏蔽的基础时长（秒）"),
      whitelist: import_koishi.Schema.array(String).default([]).description("群聊：不受频率限制的群号列表"),
      privateEnabled: import_koishi.Schema.boolean().default(false).description("启用私聊频率控制"),
      privateLimit: import_koishi.Schema.number().default(10).description("私聊：时间窗口内允许的最大触发次数"),
      privateWindow: import_koishi.Schema.number().default(60).description("私聊：时间窗口（秒）"),
      privateWarnDelay: import_koishi.Schema.number().default(30).description("私聊：警告后再次触发的时间阈值（秒）"),
      privateBlockDur: import_koishi.Schema.number().default(300).description("私聊：首次屏蔽的基础时长（秒）"),
      privateWhitelist: import_koishi.Schema.array(String).default([]).description("私聊：不受频率限制的用户ID列表"),
      blockExpBase: import_koishi.Schema.number().default(2).description("屏蔽时长指数增长底数（时长 = blockDur × base^(次数-1)），设为 1 禁用"),
      blockExpWindow: import_koishi.Schema.number().default(3600).description("指数增长重置窗口（秒），从最后一次屏蔽结束计算，超出则重置次数"),
      blockNotifyCooldown: import_koishi.Schema.number().default(60).description("屏蔽期间提示消息的冷却时间（秒），避免刷屏"),
      warnMsg: import_koishi.Schema.string().default("发言频率过高，请慢一点~").description("首次超限警告消息"),
      blockMsg: import_koishi.Schema.string().default("发言频率过高，已被禁用 {duration} 秒。").description("进入屏蔽时的通知，支持变量 {duration}"),
      blockedMsg: import_koishi.Schema.string().default("暂时被禁用，还有 {time} 秒解禁。").description("屏蔽期间再次触发时的提示，支持变量 {time}")
    }).description("频率控制")
  }),
  import_koishi.Schema.object({
    botSwitch: import_koishi.Schema.object({
      enabled: import_koishi.Schema.boolean().default(true).description("启用群聊 bot 开关"),
      defaultState: import_koishi.Schema.boolean().default(true).description("默认开启状态"),
      disabledMessage: import_koishi.Schema.string().default("机器人当前在此群处于关闭状态，请使用 bot-on 开启。").description("关闭状态下被 @ 时的提示")
    }).description("机器人开关控制")
  })
]);

// src/index.ts
var name8 = "group-control";
function apply8(ctx, config) {
  ctx.plugin(database_exports);
  ctx.plugin(basic_exports, config);
  ctx.plugin(invite_exports, config);
  ctx.plugin(frequency_exports, config);
  ctx.plugin(commands_exports, config);
  ctx.plugin(switch_exports, config);
  ctx.plugin(friend_exports, config);
}
__name(apply8, "apply");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Config,
  apply,
  name
});
