import { Context } from 'koishi'
import { Config } from '../config'
import { isBlacklistEnabled, parseGuildId, formatDate } from '../utils'
import {
    getAllBlacklistedGuilds, getBlacklistedGuild, createBlacklistedGuild, clearBlacklistedGuilds, removeBlacklistedGuild
} from '../database'

export const name = 'group-control-commands'

export function apply(ctx: Context, config: Config) {
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
