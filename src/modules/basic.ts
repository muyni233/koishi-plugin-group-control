import { Context } from 'koishi'
import { Config } from '../config'
import { notifyAdmins, hasPermission } from '../utils'
import { approvedGroups } from '../state'
import { isInSmallGroupWhitelist } from '../database'

export const name = 'group-control-basic'

/** 尝试获取群名称，失败时返回 '未知' */
async function getGroupName(bot: any, guildId: string): Promise<string> {
    // 方式1: OneBot 内部 API
    try {
        const info = await bot.internal?.getGroupInfo?.(parseInt(guildId));
        if (info?.group_name) return info.group_name;
    } catch { }
    // 方式2: Koishi 标准 API
    try {
        const info = await bot.getGuild(guildId);
        if (info?.name) return info.name;
        if ((info as any)?.group_name) return (info as any).group_name;
    } catch { }
    return '未知';
}

export function apply(ctx: Context, config: Config) {
    // 使用 Map 记录主动退群的时间戳，保留一段时间防止 guild-removed 多次触发
    const quittingGuilds = new Map<string, number>();
    // 记录已经处理过的被踢事件，防止重复通知
    const processedKicks = new Map<string, number>();

    const QUITTING_EXPIRE_MS = 60 * 1000;  // 60秒后过期
    const KICK_DEDUP_MS = 60 * 1000;       // 60秒内同一群的踢出不重复处理

    // 定期清理过期的记录
    setInterval(() => {
        const now = Date.now();
        for (const [key, time] of quittingGuilds) {
            if (now - time > QUITTING_EXPIRE_MS) quittingGuilds.delete(key);
        }
        for (const [key, time] of processedKicks) {
            if (now - time > KICK_DEDUP_MS) processedKicks.delete(key);
        }
    }, 30 * 1000);

    ctx.on('guild-added', async (session) => {
        const { guildId, platform } = session;

        // 检查黑名单
        if (config.basic.enableBlacklist) {
            const [blacklisted] = await ctx.model.get('blacklisted_guild', { platform, guildId });
            if (blacklisted) {
                try { await session.bot.sendMessage(guildId, config.basic.blacklistMessage, platform); } catch (e) { }
                quittingGuilds.set(`${platform}:${guildId}`, Date.now());
                try { await session.bot.internal.setGroupLeave(parseInt(guildId)); } catch (e) { }
                return;
            }
        }

        // 小群自动退群检测（延迟再获取群信息以确保准确）
        if (config.basic.smallGroupAutoQuit) {
            // 管理员已审核通过的群或白名单内的群不受小群自动退群限制
            const inWhitelist = await isInSmallGroupWhitelist(ctx, guildId);
            const wasApproved = approvedGroups.has(guildId);
            if (wasApproved) approvedGroups.delete(guildId); // 用完即清理

            if (inWhitelist || wasApproved) {
                // 跳过小群检测
            } else {
                const delay = config.basic.smallGroupCheckDelay || 3000;
                setTimeout(async () => {
                    try {
                        // 尝试多种方式获取群成员数
                        let memberCount = 0;
                        let groupName = '未知';

                        // 方式1: 使用 OneBot 内部 API
                        try {
                            const groupInfo = await (session.bot as any).internal?.getGroupInfo?.(parseInt(guildId));
                            memberCount = groupInfo?.member_count || 0;
                            if (groupInfo?.group_name) groupName = groupInfo.group_name;
                        } catch { }

                        // 方式2: 使用 Koishi 标准 API
                        if (memberCount === 0) {
                            try {
                                const guildInfo = await session.bot.getGuild(guildId) as any;
                                memberCount = guildInfo?.member_count || guildInfo?.memberCount || 0;
                                if (guildInfo?.name) groupName = guildInfo.name;
                            } catch { }
                        }

                        // 方式3: 使用 getGuildMemberList 获取成员列表计数
                        if (memberCount === 0) {
                            try {
                                const memberList = await session.bot.getGuildMemberList(guildId);
                                memberCount = (memberList as any)?.data?.length || 0;
                            } catch { }
                        }

                        // 如果还没拿到群名，单独再试一次
                        if (groupName === '未知') {
                            groupName = await getGroupName(session.bot, guildId);
                        }

                        if (memberCount > 0 && memberCount <= config.basic.smallGroupThreshold) {
                            // 发送退群提示
                            const quitMsg = config.basic.smallGroupQuitMessage
                                .replaceAll('{memberCount}', memberCount.toString())
                                .replaceAll('{threshold}', config.basic.smallGroupThreshold.toString())
                                .replaceAll('{groupName}', groupName)
                                .replaceAll('{groupId}', guildId);
                            try { await session.bot.sendMessage(guildId, quitMsg, platform); } catch (e) { }

                            // 通知管理员
                            if (config.basic.smallGroupNotifyAdmin) {
                                const adminMsg = `小群自动退群\n群名称：${groupName}\n群号：${guildId}\n群成员数：${memberCount}人（阈值：${config.basic.smallGroupThreshold}人）\n机器人已自动退出该群。`;
                                await notifyAdmins(session.bot, config, adminMsg);
                            }

                            // 标记为主动退出，避免触发被踢拉黑逻辑
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
                // 不要 return，先正常发送欢迎消息，小群判断在延迟后执行
            }  // else: 未审核通过的群，执行小群检测
        }

        // 发送欢迎消息
        if (config.basic.welcomeMessage) {
            try { await session.bot.sendMessage(guildId, config.basic.welcomeMessage, platform); } catch (e) { }
        }
    });

    ctx.on('guild-removed', async (session) => {
        const { guildId, platform } = session;
        const quittingKey = `${platform}:${guildId}`;

        // 主动退出的不处理（保留记录不删除，防止多次触发时第二次穿透）
        if (quittingGuilds.has(quittingKey)) {
            return;
        }

        // 去重：防止同一群的踢出事件被多次处理
        if (processedKicks.has(quittingKey)) {
            return;
        }
        processedKicks.set(quittingKey, Date.now());

        // 尝试获取群名称（被踢后可能已无法获取，降级为 '未知'）
        const groupName = await getGroupName(session.bot, guildId);

        // 被踢出 —— 加入黑名单
        if (config.basic.enableBlacklist) {
            await ctx.model.upsert('blacklisted_guild', [{
                platform,
                guildId,
                timestamp: Math.floor(Date.now() / 1000),
                reason: 'kicked'
            }]);
        }

        // 被踢出 —— 通知管理员
        if (config.basic.notifyAdminOnKick) {
            const kickMsg = config.basic.kickNotificationMessage
                .replaceAll('{groupId}', guildId)
                .replaceAll('{groupName}', groupName);
            await notifyAdmins(session.bot, config, kickMsg);
        }
    });

    if (config.basic.quitCommandEnabled) {
        const cmdOpts: any = {};
        // Koishi模式下使用 authority 限权
        if (config.permission.mode === 'koishi') {
            cmdOpts.authority = config.permission.koishiAuthority;
        }

        ctx.command('quit', '让机器人主动退出当前群聊', cmdOpts)
            .action(async ({ session }) => {
                if (!session.guildId) return 'quit 指令只能在群聊中使用。';

                // 内置权限检查
                if (config.permission.mode === 'builtin') {
                    const hasPerm = await hasPermission(session, config);
                    if (!hasPerm) return '权限不足，只有群管理员可以使用此指令。';
                }

                const { guildId, platform, userId } = session;

                // 获取群名称（此时还在群内，应该能拿到）
                const groupName = await getGroupName(session.bot, guildId);

                // 通知管理员
                const adminMsg = `收到来自 ${userId} 的退群指令\n群名称：${groupName}\n群号：${guildId}`;
                await notifyAdmins(session.bot, config, adminMsg);

                quittingGuilds.set(`${platform}:${guildId}`, Date.now());
                try {
                    await session.bot.sendMessage(session.guildId, config.basic.quitMessage.replace('{userId}', userId), platform);
                } catch (e) { }
                try {
                    await session.bot.internal.setGroupLeave(parseInt(guildId));
                } catch (e) {
                    quittingGuilds.delete(`${platform}:${guildId}`);
                    return `退出失败: ${e.message}`;
                }
                return '';
            });
    }
}
