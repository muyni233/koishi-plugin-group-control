import { Context } from 'koishi'
import { Config } from '../config'
import { isBlacklistEnabled, parseGuildId, formatDate, hasGlobalPermission } from '../utils'
import {
    getAllBlacklistedGuilds, getBlacklistedGuild, createBlacklistedGuild, clearBlacklistedGuilds, removeBlacklistedGuild,
    addToSmallGroupWhitelist, removeFromSmallGroupWhitelist, getAllSmallGroupWhitelist, isInSmallGroupWhitelist,
    clearSelfLeft, markSelfLeft
} from '../database'

export const name = 'group-control-commands'

/** 将数组按 size 切片 */
function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

/**
 * 以合并转发形式把多行文本发送到当前会话；
 * 若适配器不支持合并转发接口，则降级为分段纯文本发送。
 */
async function sendAsForward(session: any, title: string, lines: string[]): Promise<void> {
    const groups = chunk(lines, 80);  // 每个转发节点最多 80 行，避免单条过大
    const botId = String(session.bot?.selfId || '10000');
    const nodes = groups.map(g => ({
        type: 'node',
        data: { user_id: botId, nickname: title, content: g.join('\n') },
    }));
    try {
        const internal: any = session.bot.internal;
        if (session.guildId) {
            if (typeof internal.sendGroupForwardMsg !== 'function') throw new Error('no forward api');
            await internal.sendGroupForwardMsg(parseInt(session.guildId), nodes);
        } else {
            if (typeof internal.sendPrivateForwardMsg !== 'function') throw new Error('no forward api');
            await internal.sendPrivateForwardMsg(parseInt(session.userId), nodes);
        }
    } catch {
        // 降级：分段纯文本
        for (const g of groups) {
            try { await session.send(g.join('\n')); } catch { }
        }
    }
}

/** 兼容地调用 delete_friend（先位置参数，后对象参数） */
async function deleteFriendCompat(bot: any, userId: string): Promise<void> {
    const internal: any = bot.internal;
    if (typeof internal?.deleteFriend !== 'function') {
        throw new Error('当前适配器不支持 delete_friend 接口');
    }
    const n = parseInt(userId);
    try {
        await internal.deleteFriend(n);
    } catch (e) {
        // 部分实现需要对象参数（user_id / friend_id）
        await internal.deleteFriend({ user_id: n, friend_id: n, temp_block: false, both_del: false });
    }
}

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
            // 同时清理可能残留的主动退群标记，保证 unban 后新踢能正常检测
            await clearSelfLeft(ctx, guildId);
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

    // ======== 好友 / 群管理 ========

    // 列出好友（合并转发）
    ctx.command('gc.friends', '列出机器人的好友（合并转发）')
        .action(async ({ session }) => {
            if (!hasGlobalPermission(session, config)) return '权限不足，只有全局管理员可以执行此操作。';
            let list: any[] = [];
            try {
                const raw = await (session.bot.internal as any).getFriendList();
                list = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
            } catch (e) {
                return `获取好友列表失败：${e.message}`;
            }
            if (list.length === 0) return '好友列表为空。';
            const lines = list.map((f, i) => {
                const uid = f.user_id ?? f.userId ?? '';
                const name = f.remark || f.nickname || f.nick || String(uid);
                return `${i + 1}. ${name} (${uid})`;
            });
            await sendAsForward(session, `好友列表（共 ${list.length} 个）`, lines);
            return '';
        });

    // 删除好友
    ctx.command('gc.delfriend <userId:text>', '删除指定好友')
        .action(async ({ session }, input: string) => {
            if (!hasGlobalPermission(session, config)) return '权限不足，只有全局管理员可以执行此操作。';
            const userId = (input || '').trim();
            if (!/^\d+$/.test(userId)) return '输入格式错误，请输入要删除的好友 QQ 号。';
            try {
                await deleteFriendCompat(session.bot, userId);
                return `已删除好友 ${userId}。`;
            } catch (e) {
                return `删除好友失败：${e.message}`;
            }
        });

    // 列出所在群（合并转发）
    ctx.command('gc.groups', '列出机器人所在的群（合并转发）')
        .action(async ({ session }) => {
            if (!hasGlobalPermission(session, config)) return '权限不足，只有全局管理员可以执行此操作。';
            let list: any[] = [];
            try {
                const raw = await (session.bot.internal as any).getGroupList();
                list = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
            } catch (e) {
                return `获取群列表失败：${e.message}`;
            }
            if (list.length === 0) return '机器人尚未加入任何群。';
            const lines = list.map((g, i) => {
                const gid = g.group_id ?? g.groupId ?? '';
                const gname = g.group_name ?? g.groupName ?? String(gid);
                const count = g.member_count ?? g.memberCount;
                const max = g.max_member_count ?? g.maxMemberCount;
                const sizeInfo = (count != null) ? `（${count}${max != null ? `/${max}` : ''}人）` : '';
                return `${i + 1}. ${gname} (${gid})${sizeInfo}`;
            });
            await sendAsForward(session, `群列表（共 ${list.length} 个）`, lines);
            return '';
        });

    // 退出指定群
    ctx.command('gc.leave <groupId:text>', '让机器人退出指定群')
        .action(async ({ session }, input: string) => {
            if (!hasGlobalPermission(session, config)) return '权限不足，只有全局管理员可以执行此操作。';
            const guildId = parseGuildId(input);
            if (!guildId) return '输入格式错误，请输入要退出的群号。';
            // 持久标记主动退群，避免 guild-removed 误判为被踢而拉黑
            await markSelfLeft(ctx, guildId);
            try {
                await (session.bot.internal as any).setGroupLeave(parseInt(guildId));
                return `已退出群 ${guildId}。`;
            } catch (e) {
                await clearSelfLeft(ctx, guildId);  // 退群失败回滚标记
                return `退出群 ${guildId} 失败：${e.message}`;
            }
        });
}
