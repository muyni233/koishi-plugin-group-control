import { Context } from 'koishi'
import { Config } from '../config'
import { isBlacklistEnabled, parseGuildId, formatDate, hasGlobalPermission } from '../utils'
import {
    getAllBlacklistedGuilds, getBlacklistedGuild, createBlacklistedGuild, clearBlacklistedGuilds, removeBlacklistedGuild,
    addToSmallGroupWhitelist, removeFromSmallGroupWhitelist, getAllSmallGroupWhitelist, isInSmallGroupWhitelist
} from '../database'

export const name = 'group-control-commands'

export function apply(ctx: Context, config: Config) {
    // 注册主指令
    ctx.command('gc', '群控管理员指令');

    // 黑名单命令
    ctx.command('gc.ban <groupId:text>', '添加群聊到黑名单')
        .action(async ({ session }, input: string) => {
            if (!hasGlobalPermission(session, config)) return '权限不足，只有全局管理员可以执行此操作。';
            const errorMsg = isBlacklistEnabled(config.basic); if (errorMsg) return errorMsg;
            const guildId = parseGuildId(input); if (!guildId) return `输入格式错误。`;
            const existing = await getBlacklistedGuild(ctx, guildId);
            if (existing.length > 0) return `群聊 ${guildId} 已在黑名单中。`;
            await createBlacklistedGuild(ctx, guildId, 'manual_add');
            return `已添加群聊 ${guildId} 到黑名单。`;
        });

    ctx.command('gc.unban <groupId:text>', '从黑名单移除群聊')
        .action(async ({ session }, input: string) => {
            if (!hasGlobalPermission(session, config)) return '权限不足，只有全局管理员可以执行此操作。';
            const errorMsg = isBlacklistEnabled(config.basic); if (errorMsg) return errorMsg;
            const guildId = parseGuildId(input); if (!guildId) return `输入格式错误。`;
            const removed = await removeBlacklistedGuild(ctx, guildId);
            return removed ? `已移除群聊 ${guildId}` : `群聊 ${guildId} 不在黑名单中。`;
        });

    ctx.command('gc.banlist', '查看黑名单')
        .action(async ({ session }) => {
            if (!hasGlobalPermission(session, config)) return '权限不足，只有全局管理员可以执行此操作。';
            const errorMsg = isBlacklistEnabled(config.basic); if (errorMsg) return errorMsg;
            const records = await getAllBlacklistedGuilds(ctx);
            if (records.length === 0) return '黑名单为空。';
            return '黑名单列表：\n' + records.map(r => `- ${r.guildId} (时间: ${formatDate(r.timestamp)})`).join('\n');
        });

    ctx.command('gc.clearban', '清空黑名单')
        .action(async ({ session }) => {
            if (!hasGlobalPermission(session, config)) return '权限不足，只有全局管理员可以执行此操作。';
            const errorMsg = isBlacklistEnabled(config.basic); if (errorMsg) return errorMsg;
            const records = await getAllBlacklistedGuilds(ctx);
            if (records.length === 0) return '黑名单已是空的。';
            await clearBlacklistedGuilds(ctx);
            return `已清空黑名单，共移除 ${records.length} 个群聊。`;
        });

    // 小群白名单命令
    ctx.command('gc.sg-add <groupId:text>', '解除指定群聊的小群人数限制')
        .action(async ({ session }, input: string) => {
            if (!hasGlobalPermission(session, config)) return '权限不足，只有全局管理员可以执行此操作。';
            const guildId = parseGuildId(input);
            if (!guildId) return '输入格式错误，请输入群号。';
            const exists = await isInSmallGroupWhitelist(ctx, guildId);
            if (exists) return `群聊 ${guildId} 已在小群白名单中。`;
            await addToSmallGroupWhitelist(ctx, guildId);
            return `已将群聊 ${guildId} 加入小群白名单，该群不再受小群人数限制。`;
        });

    ctx.command('gc.sg-rm <groupId:text>', '恢复指定群聊的小群人数限制')
        .action(async ({ session }, input: string) => {
            if (!hasGlobalPermission(session, config)) return '权限不足，只有全局管理员可以执行此操作。';
            const guildId = parseGuildId(input);
            if (!guildId) return '输入格式错误，请输入群号。';
            const exists = await isInSmallGroupWhitelist(ctx, guildId);
            if (!exists) return `群聊 ${guildId} 不在小群白名单中。`;
            await removeFromSmallGroupWhitelist(ctx, guildId);
            return `已将群聊 ${guildId} 从小群白名单移除，该群将恢复小群人数限制。`;
        });

    ctx.command('gc.sg-list', '查看小群白名单')
        .action(async ({ session }) => {
            if (!hasGlobalPermission(session, config)) return '权限不足，只有全局管理员可以执行此操作。';
            const records = await getAllSmallGroupWhitelist(ctx);
            if (records.length === 0) return '小群白名单为空。';
            return '小群白名单列表（以下群不受小群人数限制）：\n' + records.map(r => `- ${r.guildId}`).join('\n');
        });
}
