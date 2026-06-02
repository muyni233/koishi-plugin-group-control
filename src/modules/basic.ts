import { Context } from 'koishi'
import { Config } from '../config'
import { notifyAdmins, hasGuildPermission } from '../utils'
import { approvedGroups } from '../state'
import { isInSmallGroupWhitelist, getPendingInvite, removePendingInvite, markSelfLeft, consumeSelfLeft, clearSelfLeft, clearExpiredSelfLeft, blacklistKicked, BLACKLIST_PLATFORM } from '../database'

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

    // 定期清理过期的持久化主动退群标记（guild-removed 未触发时的兜底）
    setInterval(async () => {
        try {
            await clearExpiredSelfLeft(ctx);  // 默认 5 分钟过期
        } catch { /* 静默忽略清理失败 */ }
    }, 5 * 60 * 1000);

    ctx.on('guild-added', async (session) => {
        const { guildId, platform } = session;
        ctx.logger('group-control-basic').info(`[guild-added] 触发！guildId=${guildId}, platform=${platform}`)

        // 检查黑名单
        if (config.basic.enableBlacklist) {
            const [blacklisted] = await ctx.model.get('blacklisted_guild', { platform: BLACKLIST_PLATFORM, guildId });
            if (blacklisted) {
                try { await session.bot.sendMessage(guildId, config.basic.blacklistMessage, platform); } catch (e) { }
                quittingGuilds.set(`${BLACKLIST_PLATFORM}:${guildId}`, Date.now());
                await markSelfLeft(ctx, guildId);  // 持久标记：防止重启/HMR后 guild-removed 误判为被踢
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

            // 检查是否有待处理的邀请记录（管理员手动通过邀请时也会有记录）
            const pendingInvite = await getPendingInvite(ctx, guildId);
            const hadPendingInvite = !!pendingInvite;
            if (hadPendingInvite) await removePendingInvite(ctx, guildId); // 已入群，清理记录

            if (inWhitelist || wasApproved || hadPendingInvite) {
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
                            quittingGuilds.set(`${BLACKLIST_PLATFORM}:${guildId}`, Date.now());
                            await markSelfLeft(ctx, guildId);
                            try {
                                await session.bot.internal.setGroupLeave(parseInt(guildId));
                            } catch (e) {
                                console.error(`小群自动退群失败 (群号: ${guildId}):`, e);
                                quittingGuilds.delete(`${BLACKLIST_PLATFORM}:${guildId}`);
                                await clearSelfLeft(ctx, guildId);
                            }
                        } else if (memberCount > config.basic.smallGroupThreshold) {
                            // 人数达标但未经审核，通知管理员
                            if (config.basic.smallGroupQualifiedNotifyAdmin) {
                                const qualifiedMsg = config.basic.smallGroupQualifiedMessage
                                    .replaceAll('{groupName}', groupName)
                                    .replaceAll('{groupId}', guildId)
                                    .replaceAll('{memberCount}', memberCount.toString())
                                    .replaceAll('{threshold}', config.basic.smallGroupThreshold.toString());
                                await notifyAdmins(session.bot, config, qualifiedMsg);
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
        const { guildId } = session;
        // 统一使用 BLACKLIST_PLATFORM，确保与 gc.ban/gc.unban 操作同一行
        const platform = BLACKLIST_PLATFORM;
        const dedupKey = `${platform}:${guildId}`;

        // 1) 在进程内主动退群的，快速放行（同时消费持久标记，防止堆积）
        if (quittingGuilds.has(dedupKey)) {
            // 有持久标记也一并清理（不做 consumeSelfLeft 因为不需要读，直接删更干净）
            try { await clearSelfLeft(ctx, guildId); } catch { }
            return;
        }

        // 2) 持久化主动退群标记：跨重启/HMR 仍然有效
        const isSelfLeft = await consumeSelfLeft(ctx, guildId);
        if (isSelfLeft) return;

        // 3) 根据 OneBot 原始事件判断是主动退 (leave) 还是被踢 (kick_me/kick)
        //    有 sub_type === 'leave' 明确为主动退出，不作为被踢处理
        const raw = (session.event as any)?._data || (session as any).original || (session as any).onebot || {};
        const subType = String(raw.sub_type ?? (session as any).subtype ?? '');
        const eventTs = typeof raw.time === 'number' ? raw.time : Math.floor(Date.now() / 1000);
        const ageSec = Math.floor(Date.now() / 1000) - eventTs;

        // 明确的主动退群 (OneBot group_decrease sub_type === 'leave')
        if (subType === 'leave') return;

        // 4) 过旧事件：可能是重连重放，忽略（仅在无 sub_type 时兜底；有 sub_type 的已在上方处理）
        if (!subType && ageSec > 60) return;

        // 5) 进程内去重（同名群 60s 内只处理一次）
        if (processedKicks.has(dedupKey)) return;
        processedKicks.set(dedupKey, Date.now());

        // 6) 持久化幂等：已经被自动踢出拉黑的（reason === 'kicked'）不再重复通知
        if (config.basic.enableBlacklist || config.basic.notifyAdminOnKick) {
            const [existing] = await ctx.model.get('blacklisted_guild', { platform, guildId });
            if (existing && existing.reason === 'kicked') {
                // 已拉黑过，视为重复事件，跳过（但不跳过手动拉黑 manual_add 的后续真踢通知）
                return;
            }
        }

        // 7) 写入黑名单（仅 enableBlacklist 开启时）
        if (config.basic.enableBlacklist) {
            await blacklistKicked(ctx, guildId);
        }

        // 8) 通知管理员（独立于 enableBlacklist 的开关）
        if (config.basic.notifyAdminOnKick) {
            const groupName = await getGroupName(session.bot, guildId);
            const kickMsg = config.basic.kickNotificationMessage
                .replaceAll('{groupId}', guildId)
                .replaceAll('{groupName}', groupName);
            await notifyAdmins(session.bot, config, kickMsg);
        }
    });

    // 被禁言通知
    if (config.basic.notifyAdminOnMute) {
        ctx.on('guild-member-mute' as any, async (session: any) => {
            // 只关心 bot 自己被禁言
            if (session.userId !== session.bot?.userId) return
            // duration 为 0 表示解除禁言，不通知
            if (!session.duration) return

            const { guildId, platform } = session
            const operatorId = session.operatorId || '未知'
            const duration = session.duration ?? 0
            const groupName = await getGroupName(session.bot, guildId)

            const msg = config.basic.muteNotificationMessage
                .replaceAll('{groupId}', guildId)
                .replaceAll('{groupName}', groupName)
                .replaceAll('{operatorId}', operatorId)
                .replaceAll('{duration}', duration.toString())
            await notifyAdmins(session.bot, config, msg)
        })
    }

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
                    const hasPerm = await hasGuildPermission(session, config);
                    if (!hasPerm) return '权限不足，只有群管理员可以使用此指令。';
                }

                const { guildId, platform, userId } = session;

                // 获取群名称（此时还在群内，应该能拿到）
                const groupName = await getGroupName(session.bot, guildId);

                // 通知管理员
                const adminMsg = `收到来自 ${userId} 的退群指令\n群名称：${groupName}\n群号：${guildId}`;
                await notifyAdmins(session.bot, config, adminMsg);

                quittingGuilds.set(`${BLACKLIST_PLATFORM}:${guildId}`, Date.now());
                await markSelfLeft(ctx, guildId);
                try {
                    await session.bot.sendMessage(session.guildId, config.basic.quitMessage.replace('{userId}', userId), platform);
                } catch (e) { }
                try {
                    await session.bot.internal.setGroupLeave(parseInt(guildId));
                } catch (e) {
                    quittingGuilds.delete(`${BLACKLIST_PLATFORM}:${guildId}`);
                    await clearSelfLeft(ctx, guildId);
                    return `退出失败: ${e.message}`;
                }
                return '';
            });
    }
}
