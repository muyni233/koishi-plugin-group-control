import { Context } from 'koishi'
import { Config } from '../config'
import { notifyAdmins, hasGuildPermission } from '../utils'
import { isInSmallGroupWhitelist, getPendingInvite, removePendingInvite, markSelfLeft, consumeSelfLeft, clearSelfLeft, clearExpiredSelfLeft, blacklistKicked, createBlacklistedGuild, isApprovedGuild, clearApprovedGuild, BLACKLIST_PLATFORM } from '../database'

export const name = 'group-control-basic'

/** 尝试获取群名称，失败时返回 '未知' */
async function getGroupName(bot: any, guildId: string): Promise<string> {
    // 方式1: OneBot 内部 API
    try {
        const info = await bot.internal?.getGroupInfo?.(parseInt(guildId));
        const data = info?.data ?? info;
        if (data?.group_name) return data.group_name;
    } catch { }
    // 方式2: Koishi 标准 API
    try {
        const info = await bot.getGuild(guildId);
        if (info?.name) return info.name;
        if ((info as any)?.group_name) return (info as any).group_name;
    } catch { }
    return '未知';
}

/** 小群检测结果。count 为用于判定/展示的人数（排除官方机器人后为真人数） */
interface SmallGroupResult {
    /** quit: 应退群；keep: 人数达标保留；unknown: 无法判定（不操作） */
    decision: 'quit' | 'keep' | 'unknown';
    count: number;
    groupName: string;
}

export function apply(ctx: Context, config: Config) {
    // 使用 Map 记录主动退群的时间戳，保留一段时间防止 guild-removed 多次触发
    const quittingGuilds = new Map<string, number>();
    // 记录已经处理过的被踢事件，防止重复通知
    const processedKicks = new Map<string, number>();
    // 记录已处理过的 guild-added，防止 OneBot 重连/重放导致重复检测与重复通知
    const processedAdds = new Map<string, number>();
    // 实时监控：记录每个群上次复检时间，做冷却限流
    const realtimeLastCheck = new Map<string, number>();

    const QUITTING_EXPIRE_MS = 60 * 1000;  // 60秒后过期
    const KICK_DEDUP_MS = 60 * 1000;       // 60秒内同一群的踢出不重复处理
    const ADD_DEDUP_MS = 10 * 1000;        // 10秒内同一群的 guild-added 视为重放
    const REALTIME_DEBOUNCE_MS = 1500;     // 实时复检前的防抖（合并瞬时连续退群）

    // 定期清理过期的记录
    setInterval(() => {
        const now = Date.now();
        for (const [key, time] of quittingGuilds) {
            if (now - time > QUITTING_EXPIRE_MS) quittingGuilds.delete(key);
        }
        for (const [key, time] of processedKicks) {
            if (now - time > KICK_DEDUP_MS) processedKicks.delete(key);
        }
        for (const [key, time] of processedAdds) {
            if (now - time > ADD_DEDUP_MS) processedAdds.delete(key);
        }
        // 实时复检冷却记录：超过 5 分钟无新事件即可清理
        for (const [key, time] of realtimeLastCheck) {
            if (now - time > 5 * 60 * 1000) realtimeLastCheck.delete(key);
        }
    }, 30 * 1000);

    // 定期清理过期的持久化主动退群标记（guild-removed 未触发时的兜底）
    setInterval(async () => {
        try {
            await clearExpiredSelfLeft(ctx);  // 默认 5 分钟过期
        } catch { /* 静默忽略清理失败 */ }
    }, 5 * 60 * 1000);

    /**
     * 评估一个群是否为「小群」。
     *
     * 排除官方机器人时采用分级短路，尽量少调用接口、少遍历：
     *   1. 原始人数 ≤ 阈值          → 直接判定 quit（无需拉成员列表）
     *   2. 原始人数 > 阈值 + 机器人上限 → 直接判定 keep（即使全是机器人也不可能变小群）
     *   3. 介于两者之间（模糊区间）  → 拉一次成员列表，统计 is_robot/自身，
     *      一旦机器人数足以使「真人数 ≤ 阈值」即提前结束遍历。
     */
    async function evaluateSmallGroup(bot: any, guildId: string): Promise<SmallGroupResult> {
        const threshold = config.basic.smallGroupThreshold;
        const exclude = config.basic.smallGroupExcludeOfficialBots;
        const maxBots = 20;  // 单群官方机器人数量上限固定为 20

        // —— 步骤1：轻量获取原始总人数与群名 ——
        let total = 0;
        let groupName = '未知';
        try {
            const info = await bot.internal?.getGroupInfo?.(parseInt(guildId));
            const data = info?.data ?? info;
            total = Number(data?.member_count) || 0;
            if (data?.group_name) groupName = data.group_name;
        } catch { }
        if (total === 0) {
            try {
                const guildInfo = await bot.getGuild(guildId) as any;
                total = Number(guildInfo?.member_count ?? guildInfo?.memberCount) || 0;
                if (guildInfo?.name) groupName = guildInfo.name;
            } catch { }
        }

        // —— 步骤2：基于原始人数的短路判定 ——
        // 原始人数已 ≤ 阈值：真人数只会更少，直接退，无需排除机器人
        if (total > 0 && total <= threshold) {
            return { decision: 'quit', count: total, groupName };
        }
        // 不排除机器人：直接用原始人数判定
        if (!exclude) {
            if (total > 0) return { decision: total <= threshold ? 'quit' : 'keep', count: total, groupName };
            // total 未知时落到成员列表兜底
        } else if (total > threshold + maxBots) {
            // 即使塞满机器人也不可能是小群
            return { decision: 'keep', count: total, groupName };
        }

        // —— 步骤3：模糊区间（或原始人数未知），拉一次成员列表统计 ——
        let list: any[] = [];
        try {
            const raw = await bot.internal?.getGroupMemberList?.(parseInt(guildId));
            list = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
        } catch { }

        if (list.length === 0) {
            // 无法获取列表：用原始人数兜底，仍拿不到则放弃
            if (total > 0) return { decision: total <= threshold ? 'quit' : 'keep', count: total, groupName };
            return { decision: 'unknown', count: 0, groupName };
        }

        const N = list.length;
        if (!exclude) return { decision: N <= threshold ? 'quit' : 'keep', count: N, groupName };
        if (N <= threshold) return { decision: 'quit', count: N, groupName };

        // 统计机器人：当 bots ≥ N - threshold 时，真人数必 ≤ 阈值，可提前结束
        const selfId = String(bot.selfId ?? '');
        const botsNeeded = N - threshold;
        let bots = 0;
        for (const m of list) {
            const uid = String(m?.user_id ?? m?.userId ?? '');
            if (m?.is_robot === true || (selfId && uid === selfId)) {
                bots++;
                if (bots >= botsNeeded) {
                    // 真人数 = N - bots ≤ threshold，判定为小群，无需继续遍历
                    return { decision: 'quit', count: N - bots, groupName };
                }
            }
        }
        const real = N - bots;
        return { decision: real <= threshold ? 'quit' : 'keep', count: real, groupName };
    }

    /** 执行小群退群：群内提示 + 通知管理员 + 标记主动退群 + 退群（失败回滚） */
    async function performSmallGroupQuit(bot: any, platform: string, guildId: string, groupName: string, memberCount: number) {
        const threshold = config.basic.smallGroupThreshold;
        const quitMsg = config.basic.smallGroupQuitMessage
            .replaceAll('{memberCount}', memberCount.toString())
            .replaceAll('{threshold}', threshold.toString())
            .replaceAll('{groupName}', groupName)
            .replaceAll('{groupId}', guildId);
        try { await bot.sendMessage(guildId, quitMsg, platform); } catch (e) { }

        if (config.basic.smallGroupNotifyAdmin) {
            const adminMsg = `小群自动退群\n群名称：${groupName}\n群号：${guildId}\n群成员数：${memberCount}人（阈值：${threshold}人）\n机器人已自动退出该群。`;
            await notifyAdmins(bot, config, adminMsg);
        }

        // 标记为主动退出，避免触发被踢拉黑逻辑
        quittingGuilds.set(`${BLACKLIST_PLATFORM}:${guildId}`, Date.now());
        await markSelfLeft(ctx, guildId);
        try {
            await bot.internal.setGroupLeave(parseInt(guildId));
        } catch (e) {
            console.error(`小群自动退群失败 (群号: ${guildId}):`, e);
            quittingGuilds.delete(`${BLACKLIST_PLATFORM}:${guildId}`);
            await clearSelfLeft(ctx, guildId);
        }
    }

    ctx.on('guild-added', async (session) => {
        const { guildId, platform } = session;
        ctx.logger('group-control-basic').info(`[guild-added] 触发！guildId=${guildId}, platform=${platform}`)

        // guild-added 去重：防止 OneBot 重连/重放导致重复欢迎与重复小群检测
        const addKey = `${BLACKLIST_PLATFORM}:${guildId}`;
        if (processedAdds.has(addKey)) {
            ctx.logger('group-control-basic').info(`[guild-added] 忽略重复事件 guildId=${guildId}`)
            return;
        }
        processedAdds.set(addKey, Date.now());

        // 检查黑名单
        if (config.basic.enableBlacklist) {
            const [blacklisted] = await ctx.database.get('blacklisted_guild', { platform: BLACKLIST_PLATFORM, guildId });
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
            const wasApproved = await isApprovedGuild(ctx, guildId);

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
                        const res = await evaluateSmallGroup(session.bot, guildId);
                        let groupName = res.groupName;
                        if (groupName === '未知') groupName = await getGroupName(session.bot, guildId);

                        if (res.decision === 'quit') {
                            await performSmallGroupQuit(session.bot, platform, guildId, groupName, res.count);
                        } else if (res.decision === 'keep') {
                            // 人数达标但未经审核，通知管理员
                            if (config.basic.smallGroupQualifiedNotifyAdmin) {
                                const qualifiedMsg = config.basic.smallGroupQualifiedMessage
                                    .replaceAll('{groupName}', groupName)
                                    .replaceAll('{groupId}', guildId)
                                    .replaceAll('{memberCount}', res.count.toString())
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

    // ======== 实时小群监控 ========
    // 只有「成员退群」才可能让群变小，故仅监听该事件，不做任何轮询。
    // 配合 per-群冷却 + 防抖，仅在群真正缩小时才发起一次轻量复检。
    if (config.basic.smallGroupAutoQuit && config.basic.smallGroupRealtimeMonitor) {
        ctx.on('guild-member-removed', async (session) => {
            const { guildId, platform } = session;
            if (!guildId) return;
            // 机器人自身退群由 guild-removed 处理，忽略
            if (String(session.userId) === String(session.bot.selfId)) return;
            // 已在退群流程中的群跳过
            if (quittingGuilds.has(`${BLACKLIST_PLATFORM}:${guildId}`)) return;

            // 冷却限流（内存判断，先于数据库查询，避免频繁查库）：同一群两次复检的最小间隔
            const cooldown = (config.basic.smallGroupRecheckCooldown || 60) * 1000;
            const now = Date.now();
            if (now - (realtimeLastCheck.get(guildId) || 0) < cooldown) return;
            realtimeLastCheck.set(guildId, now);

            // 白名单群、已审核通过的群永久豁免实时监控（仅监控未经审核被拉入的群）
            if (await isInSmallGroupWhitelist(ctx, guildId)) return;
            if (await isApprovedGuild(ctx, guildId)) return;

            // 防抖：合并瞬时连续退群，稍后再复检
            setTimeout(async () => {
                try {
                    if (quittingGuilds.has(`${BLACKLIST_PLATFORM}:${guildId}`)) return;
                    const res = await evaluateSmallGroup(session.bot, guildId);
                    if (res.decision === 'quit') {
                        let groupName = res.groupName;
                        if (groupName === '未知') groupName = await getGroupName(session.bot, guildId);
                        await performSmallGroupQuit(session.bot, platform, guildId, groupName, res.count);
                    }
                } catch (error) {
                    console.error(`实时小群检测失败 (群号: ${guildId}):`, error);
                }
            }, REALTIME_DEBOUNCE_MS);
        });
    }

    ctx.on('guild-removed', async (session) => {
        const { guildId } = session;
        // 统一使用 BLACKLIST_PLATFORM，确保与 gc.ban/gc.unban 操作同一行
        const platform = BLACKLIST_PLATFORM;
        const dedupKey = `${platform}:${guildId}`;

        // 离开群（无论主动退/被踢）即清除「已审核」标记：
        // 若日后被未经审核地重新拉入，将重新接受小群检测。
        try { await clearApprovedGuild(ctx, guildId); } catch { }

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
            const [existing] = await ctx.database.get('blacklisted_guild', { platform, guildId });
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

    // 被禁言通知 / 被长时间禁言自动退群拉黑
    if (config.basic.notifyAdminOnMute || config.basic.muteAutoQuit) {
        ctx.on('guild-member-mute' as any, async (session: any) => {
            // 只关心 bot 自己被禁言
            if (session.userId !== session.bot?.userId) return
            // duration 为 0 表示解除禁言，不处理
            if (!session.duration) return

            const { guildId, platform } = session
            const operatorId = session.operatorId || '未知'
            const duration = session.duration ?? 0
            const groupName = await getGroupName(session.bot, guildId)

            // 被禁言时长达到阈值：自动退群并拉黑（优先于普通通知）
            if (config.basic.muteAutoQuit && duration >= config.basic.muteAutoQuitThreshold) {
                // 通知管理员
                const quitMsg = config.basic.muteQuitNotificationMessage
                    .replaceAll('{groupId}', guildId)
                    .replaceAll('{groupName}', groupName)
                    .replaceAll('{operatorId}', operatorId)
                    .replaceAll('{duration}', duration.toString())
                await notifyAdmins(session.bot, config, quitMsg)

                // 拉入黑名单（reason='muted'，避免被 guild-removed 当作被踢重复处理）
                try { await createBlacklistedGuild(ctx, guildId, 'muted') } catch (e) { }

                // 标记主动退群并退出（被禁言状态下无法发群消息，故不再尝试群内提示）
                quittingGuilds.set(`${BLACKLIST_PLATFORM}:${guildId}`, Date.now())
                await markSelfLeft(ctx, guildId)
                try {
                    await session.bot.internal.setGroupLeave(parseInt(guildId))
                } catch (e) {
                    console.error(`被禁言自动退群失败 (群号: ${guildId}):`, e)
                    quittingGuilds.delete(`${BLACKLIST_PLATFORM}:${guildId}`)
                    await clearSelfLeft(ctx, guildId)
                }
                return
            }

            // 普通被禁言通知
            if (config.basic.notifyAdminOnMute) {
                const msg = config.basic.muteNotificationMessage
                    .replaceAll('{groupId}', guildId)
                    .replaceAll('{groupName}', groupName)
                    .replaceAll('{operatorId}', operatorId)
                    .replaceAll('{duration}', duration.toString())
                await notifyAdmins(session.bot, config, msg)
            }
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
                    await session.bot.sendMessage(session.guildId, config.basic.quitMessage.replaceAll('{userId}', userId), platform);
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
