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
      enableBlacklist: import_koishi.Schema.boolean().default(true).description("启用黑名单"),
      quitCommandEnabled: import_koishi.Schema.boolean().default(true).description("启用quit"),
      quitCommandAuthority: import_koishi.Schema.number().default(3).description("quit指令所需权限")
    }).description("基础群组管理")
  }),
  import_koishi.Schema.object({
    frequency: import_koishi.Schema.object({
      enabled: import_koishi.Schema.boolean().default(false).description("启用频率控制（对所有命令生效）"),
      limit: import_koishi.Schema.number().default(5).description("时间窗口内允许的最大命令次数"),
      window: import_koishi.Schema.number().default(60).description("频率检测时间窗口（秒）"),
      warnDelay: import_koishi.Schema.number().default(30).description("发出警告后，再次触发的时间阈值（秒），在此时间内再次触发则进入屏蔽状态"),
      blockDur: import_koishi.Schema.number().default(300).description("触发频率限制后屏蔽的时长（秒）"),
      warnMsg: import_koishi.Schema.string().default("命令频率过高，请慢一点~").description("频率过高时发送的警告消息"),
      blockMsg: import_koishi.Schema.string().default("命令频率过高，本群指令已被禁用 {duration} 秒。").description("触发频率限制后发送的屏蔽通知消息，支持变量{duration}"),
      blockedMsg: import_koishi.Schema.string().default("指令暂时被禁用，还有 {time} 秒解禁。").description("屏蔽期间接收到指令时的提示消息，支持变量{time}"),
      whitelist: import_koishi.Schema.array(String).default([]).description("频率控制白名单群号列表，白名单内的群聊不受频率限制")
    }).description("命令频率控制")
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
  ctx.on("guild-added", async (session) => {
    const { guildId, platform } = session;
    if (!config.basic.enableBlacklist) {
      if (config.basic.welcomeMessage) {
        try {
          await session.bot.sendMessage(guildId, config.basic.welcomeMessage, platform);
        } catch (error) {
          console.error("发送欢迎消息失败:", error);
        }
      }
      return;
    }
    const [blacklisted] = await ctx.model.get("blacklisted_guild", { platform, guildId });
    if (blacklisted) {
      try {
        await session.bot.sendMessage(guildId, config.basic.blacklistMessage, platform);
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
    if (config.basic.welcomeMessage) {
      try {
        await session.bot.sendMessage(guildId, config.basic.welcomeMessage, platform);
      } catch (error) {
        console.error("发送欢迎消息失败:", error);
      }
    }
  });
  ctx.on("guild-removed", async (session) => {
    const { guildId, platform } = session;
    if (!config.basic.enableBlacklist) {
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
      if (!session.guildId || !config.frequency.enabled) {
        return;
      }
      const { guildId, platform } = session;
      if (config.frequency.whitelist && config.frequency.whitelist.includes(guildId)) {
        return;
      }
      let record = await getCommandFrequencyRecord(ctx, platform, guildId);
      function handleExpiredWindow(currentRecord, platform2, guildId2, now2, windowStart2, warnDelay) {
        if (currentRecord && currentRecord.lastCommandTime < windowStart2) {
          if (currentRecord.warningSent && currentRecord.firstWarningTime > 0) {
            if (now2 - currentRecord.firstWarningTime > warnDelay) {
              return {
                platform: platform2,
                guildId: guildId2,
                commandCount: 1,
                lastCommandTime: now2,
                warningSent: false,
                // 重置警告状态
                blockExpiryTime: 0,
                firstWarningTime: 0
                // 重置警告时间
              };
            } else {
              currentRecord.commandCount = 1;
              currentRecord.lastCommandTime = now2;
              return currentRecord;
            }
          } else if (isCurrentlyBlocked(currentRecord) && Date.now() >= currentRecord.blockExpiryTime * 1e3) {
            return {
              platform: platform2,
              guildId: guildId2,
              commandCount: 1,
              lastCommandTime: now2,
              warningSent: false,
              blockExpiryTime: 0,
              firstWarningTime: 0
            };
          } else {
            return {
              platform: platform2,
              guildId: guildId2,
              commandCount: 1,
              lastCommandTime: now2,
              warningSent: false,
              blockExpiryTime: 0,
              firstWarningTime: 0
            };
          }
        } else {
          if (currentRecord) {
            currentRecord.commandCount += 1;
            currentRecord.lastCommandTime = now2;
            return currentRecord;
          } else {
            return {
              platform: platform2,
              guildId: guildId2,
              commandCount: 1,
              lastCommandTime: now2,
              warningSent: false,
              blockExpiryTime: 0,
              firstWarningTime: 0
            };
          }
        }
      }
      __name(handleExpiredWindow, "handleExpiredWindow");
      if (record && isCurrentlyBlocked(record)) {
        try {
          const remainingTime = Math.ceil((record.blockExpiryTime * 1e3 - Date.now()) / 1e3);
          const blockedMessage = config.frequency.blockedMsg.replace("{time}", remainingTime.toString());
          await session.bot.sendMessage(guildId, blockedMessage, platform);
        } catch (error) {
          console.error("发送屏蔽提示失败:", error);
        }
        throw new Error("Command frequency limit exceeded - currently blocked");
      }
      const now = Math.floor(Date.now() / 1e3);
      const windowStart = now - config.frequency.window;
      record = handleExpiredWindow(record, platform, guildId, now, windowStart, config.frequency.warnDelay);
      if (record.commandCount > config.frequency.limit) {
        if (isCurrentlyBlocked(record)) {
          const remainingTime = Math.ceil((record.blockExpiryTime * 1e3 - Date.now()) / 1e3);
          try {
            const blockedMessage = config.frequency.blockedMsg.replace("{time}", remainingTime.toString());
            await session.bot.sendMessage(guildId, blockedMessage, platform);
          } catch (error) {
            console.error("发送屏蔽提示失败:", error);
          }
          throw new Error("Command frequency limit exceeded - currently blocked");
        } else {
          if (!record.warningSent) {
            try {
              await session.bot.sendMessage(guildId, config.frequency.warnMsg, platform);
            } catch (error) {
              console.error("发送频率警告消息失败:", error);
            }
            record.warningSent = true;
            record.commandCount = 1;
            record.lastCommandTime = now;
            record.firstWarningTime = now;
            await updateCommandFrequencyRecord(ctx, platform, guildId, record);
            throw new Error("Command frequency limit exceeded - warning issued");
          } else {
            const blockExpiryTime = now + config.frequency.blockDur;
            record.blockExpiryTime = blockExpiryTime;
            record.warningSent = false;
            record.commandCount = 0;
            record.firstWarningTime = 0;
            await updateCommandFrequencyRecord(ctx, platform, guildId, record);
            try {
              const blockMessage = config.frequency.blockMsg.replace("{duration}", config.frequency.blockDur.toString());
              await session.bot.sendMessage(guildId, blockMessage, platform);
            } catch (error) {
              console.error("发送屏蔽通知失败:", error);
            }
            throw new Error("Command frequency limit exceeded - blocked");
          }
        }
      }
      await updateCommandFrequencyRecord(ctx, platform, guildId, record);
    });
  }
  if (config.basic.quitCommandEnabled) {
    ctx.command("quit", "让机器人主动退出当前群聊", { authority: config.basic.quitCommandAuthority }).action(async ({ session }) => {
      if (!session.guildId) return "quit 指令只能在群聊中使用。";
      const { guildId, platform, userId } = session;
      const message = config.basic.quitMessage.replace("{userId}", userId);
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
    const errorMsg = isBlacklistEnabled(config.basic);
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
    const errorMsg = isBlacklistEnabled(config.basic);
    if (errorMsg) return errorMsg;
    const guildId = parseGuildId(input);
    if (!guildId) return `输入格式错误。请输入纯群号或 onebot:群号 格式。`;
    const removed = await removeBlacklistedGuild(ctx, guildId);
    return removed ? `已移除群聊 ${guildId}` : `群聊 ${guildId} 不在黑名单中。`;
  }
  __name(removeFromBlacklist, "removeFromBlacklist");
  ctx.command("remove-from-blacklist <groupId:text>", "从黑名单移除指定群聊", { authority: 4 }).action(removeFromBlacklist);
  async function addToBlacklist({}, input) {
    const errorMsg = isBlacklistEnabled(config.basic);
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
    const errorMsg = isBlacklistEnabled(config.basic);
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
