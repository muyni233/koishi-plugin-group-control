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
var Config = import_koishi.Schema.object({
  welcomeMessage: import_koishi.Schema.string().default("你好，我是机器人。感谢邀请我加入！").description("机器人加入群聊时发送的欢迎消息"),
  blacklistMessage: import_koishi.Schema.string().default("此群聊已被拉黑，机器人将自动退出。").description("被拉入黑名单群后在群内发送的提示"),
  quitMessage: import_koishi.Schema.string().default("收到来自{userId}的指令，即将退出群聊。").description("用户发送quit指令后在群内发送的提示，支持变量{userId}(指令发送者id)"),
  enableBlacklist: import_koishi.Schema.boolean().default(true).description("启用黑名单"),
  quitCommandEnabled: import_koishi.Schema.boolean().default(true).description("启用quit"),
  quitCommandAuthority: import_koishi.Schema.number().default(3).description("quit指令所需权限")
});
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
function apply(ctx, config) {
  ctx.model.extend("blacklisted_guild", {
    platform: "string",
    guildId: "string",
    timestamp: "integer",
    reason: "string"
  }, { primary: ["platform", "guildId"] });
  ctx.on("guild-added", async (session) => {
    const { guildId, platform } = session;
    if (!config.enableBlacklist) {
      if (config.welcomeMessage) {
        try {
          await session.bot.sendMessage(guildId, config.welcomeMessage, platform);
        } catch (error) {
          console.error("发送欢迎消息失败:", error);
        }
      }
      return;
    }
    const [blacklisted] = await ctx.model.get("blacklisted_guild", { platform, guildId });
    if (blacklisted) {
      try {
        await session.bot.sendMessage(guildId, config.blacklistMessage, platform);
      } catch (error) {
        console.error("发送黑名单提示失败:", error);
      }
      try {
        await session.bot.internal.setGroupLeave(parseInt(guildId));
      } catch (error) {
        console.error("退出黑名单群聊失败:", error);
      }
      return;
    }
    if (config.welcomeMessage) {
      try {
        await session.bot.sendMessage(guildId, config.welcomeMessage, platform);
      } catch (error) {
        console.error("发送欢迎消息失败:", error);
      }
    }
  });
  ctx.on("guild-removed", async (session) => {
    const { guildId, platform } = session;
    if (!config.enableBlacklist) {
      return;
    }
    await ctx.model.upsert("blacklisted_guild", [{
      platform,
      guildId,
      timestamp: Math.floor(Date.now() / 1e3),
      reason: "kicked"
    }]);
  });
  if (config.quitCommandEnabled) {
    ctx.command("quit", "让机器人主动退出当前群聊", { authority: config.quitCommandAuthority }).action(async ({ session }) => {
      if (!session.guildId) return "quit 指令只能在群聊中使用。";
      const { guildId, platform, userId } = session;
      const message = config.quitMessage.replace("{userId}", userId);
      try {
        await session.bot.sendMessage(session.guildId, message, platform);
      } catch (sendError) {
        console.error("发送退出提示消息失败:", sendError);
      }
      try {
        await session.bot.internal.setGroupLeave(parseInt(guildId));
      } catch (leaveError) {
        console.error("退出群聊失败:", leaveError);
        const failMessage = `退出失败: ${leaveError.message || "OneBot API 调用失败"}`;
        try {
          await session.bot.sendMessage(session.guildId, failMessage, platform);
        } catch (reSendError) {
          console.error("发送退出失败提示也失败:", reSendError);
        }
        return failMessage;
      }
      return "";
    });
  }
  async function viewBlacklist({ session }) {
    const errorMsg = isBlacklistEnabled(config);
    if (errorMsg) return errorMsg;
    const records = await getAllBlacklistedGuilds(ctx);
    if (records.length === 0) return "黑名单为空。";
    let msg = "黑名单列表：\n";
    records.forEach((r) => {
      const time = formatDate(r.timestamp);
      msg += `- ${r.guildId} (时间: ${time})
`;
    });
    return msg.trim();
  }
  __name(viewBlacklist, "viewBlacklist");
  ctx.command("view-blacklist", "查看被拉黑的群聊列表", { authority: 4 }).action(viewBlacklist);
  async function removeFromBlacklist({}, input) {
    const errorMsg = isBlacklistEnabled(config);
    if (errorMsg) return errorMsg;
    const guildId = parseGuildId(input);
    if (!guildId) return `输入格式错误。请输入纯群号或 onebot:群号 格式。`;
    const removed = await removeBlacklistedGuild(ctx, guildId);
    return removed ? `已移除群聊 ${guildId}` : `群聊 ${guildId} 不在黑名单中。`;
  }
  __name(removeFromBlacklist, "removeFromBlacklist");
  ctx.command("remove-from-blacklist <groupId:text>", "从黑名单移除指定群聊", { authority: 4 }).action(removeFromBlacklist);
  async function addToBlacklist({}, input) {
    const errorMsg = isBlacklistEnabled(config);
    if (errorMsg) return errorMsg;
    const guildId = parseGuildId(input);
    if (!guildId) return `输入格式错误。请输入纯群号或 onebot:群号 格式。`;
    const existing = await getBlacklistedGuild(ctx, guildId);
    if (existing.length > 0) return `群聊 ${guildId} 已在黑名单中。`;
    await createBlacklistedGuild(ctx, guildId, "manual_add");
    return `已添加群聊 ${guildId} 到黑名单。`;
  }
  __name(addToBlacklist, "addToBlacklist");
  ctx.command("add-to-blacklist <groupId:text>", "手动添加群聊到黑名单 (输入群号)", { authority: 4 }).action(addToBlacklist);
  async function clearBlacklist({ session }) {
    const errorMsg = isBlacklistEnabled(config);
    if (errorMsg) return errorMsg;
    const records = await getAllBlacklistedGuilds(ctx);
    const count = records.length;
    if (count === 0) return "黑名单已是空的。";
    await clearBlacklistedGuilds(ctx);
    return `已清空黑名单，共移除 ${count} 个群聊。`;
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
