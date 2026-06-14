import { Context } from 'koishi'
import { Config } from '../config'
import { hasGlobalPermission, notifyAdmins, parseGuildId, getAdminCommandOptions } from '../utils'
import {
    getPendingInvite, addPendingInvite, removePendingInvite,
    getAllPendingInvites, clearExpiredPendingInvites,
    getBlacklistedGuild, markApprovedGuild
} from '../database'

export const name = 'group-control-invite'

function getBotSelfId(bot: any): string | null {
    return parseGuildId(String(bot?.selfId ?? bot?.userId ?? ''));
}

async function handleInviteRequest(bot: any, flag: string, approve: boolean, comment = '') {
    if (typeof bot.handleGuildRequest === 'function') {
        try {
            await bot.handleGuildRequest(flag, approve, comment);
            return;
        } catch { }
    }
    await bot.internal.setGroupAddRequest(flag, 'invite', approve, comment);
}

export function apply(ctx: Context, config: Config) {
    if (!config.invite.enabled) return;

    // 定期清理超时的邀请（比如每天一次，或者按需，这里每小时检查一次）
    ctx.setInterval(async () => {
        const expireMs = config.invite.inviteExpireDays * 24 * 60 * 60 * 1000;
        try {
            for (const bot of ctx.bots) {
                await clearExpiredPendingInvites(ctx, bot.platform, expireMs);
            }
            if (config.invite.showDetailedLog) {
                console.log('已执行过期邀请清理');
            }
        } catch (error) {
            console.error('清理过期邀请失败:', error);
        }
    }, 60 * 60 * 1000);

    // 监听群聊邀请事件
    ctx.logger('group-control-invite').info('invite 模块已加载，正在监听 guild-request 事件')

    ctx.on('guild-request', async (session) => {
        ctx.logger('group-control-invite').info(`[guild-request] 触发！userId=${session.userId}, guildId=${session.guildId}, messageId=${session.messageId}, type=${session.type}, subtype=${(session as any).subtype}`)
        ctx.logger('group-control-invite').info(`[guild-request] event 对象: ${JSON.stringify(session.event, null, 2)}`)

        // 直接从原始数据获取 ID
        const raw = (session as any).original || (session as any).raw || (session.event as any)?._data || {};

        // guild-request 同时涵盖「被邀请入群(invite)」与「用户申请加入(add)」两种子类型。
        // 本模块只处理被邀请入群；若明确是用户申请进群(add)则跳过，避免误把进群申请当邀请处理。
        const subType = String(raw.sub_type ?? (session as any).subtype ?? '');
        if (subType && subType !== 'invite') return;


        // 提取 flag
        const flag = raw.flag || (session as any).flag || session.messageId;

        // 提取真实的 user_id 和 group_id
        const rawUserId = raw.user_id ? String(raw.user_id) : session.userId;
        const rawGroupId = raw.group_id ? String(raw.group_id) : session.guildId;
        const userId = parseGuildId(rawUserId);
        const groupId = parseGuildId(rawGroupId);
        const selfId = getBotSelfId(session.bot);
        if (!userId || !groupId || !selfId) {
            ctx.logger('group-control-invite').warn(`无法解析邀请事件 ID: userId=${rawUserId}, groupId=${rawGroupId}, selfId=${session.bot?.selfId}`);
            return;
        }

        const { platform } = session;

        // 黑名单拦截：已被拉黑的群邀请一律自动拒绝（不进群、不通知管理员审核）
        if (config.basic.enableBlacklist) {
            const bl = await getBlacklistedGuild(ctx, groupId);
            if (bl.length > 0) {
                // 尝试拒绝邀请（flag 有可能已失效，做 best-effort）
                try {
                    await handleInviteRequest(session.bot, flag, false, '该群已被机器人拉黑');
                } catch (e) {
                    ctx.logger('group-control-invite').warn('拒绝黑名单群邀请失败 (flag 可能已失效):', e);
                }

                // 通知管理员（告知已自动拒绝，以及如何放行）
                const rejectNotify = `已自动拒绝黑名单群邀请\n群号：${groupId}\n邀请者 QQ：${userId}\n如需放行请先执行 gc.unban ${groupId} 再让对方重新邀请。`;
                try { await notifyAdmins(session.bot, config, rejectNotify); } catch (e) { }

                // 通知邀请者
                try {
                    const rejectMsg = `您邀请加入的群 ${groupId} 已被机器人拉黑，邀请已被自动拒绝。如有疑问请联系机器人管理员。`;
                    await session.bot.sendPrivateMessage(userId, rejectMsg);
                } catch (e) { }

                if (config.invite.showDetailedLog) {
                    console.log(`已自动拒绝黑名单群邀请: 群号 ${groupId}, 邀请者 ${userId}`);
                }
                return;
            }
        }

        if (!flag && config.invite.showDetailedLog) {
            console.warn('未能提取到邀请 flag，可能导致无法处理邀请。Raw event:', JSON.stringify(raw));
        }

        if (config.invite.showDetailedLog) {
            console.log(`收到群邀请事件 - 原始数据: UserID=${raw.user_id}, GroupID=${raw.group_id}, Flag=${flag}`);
        }

        // 获取邀请者信息
        let userName = userId;
        try {
            const userInfo = await session.bot.getUser(userId);
            userName = userInfo?.nickname || userInfo?.name || userId;
        } catch (error) {
            console.error('获取用户信息失败:', error);
        }

        // 获取群信息
        let groupName = groupId;
        try {
            const guildInfo = await session.bot.getGuild(groupId) as any;
            groupName = guildInfo?.name || guildInfo?.group_name || groupId;
        } catch (error) {
            console.error('获取群信息失败:', error);
        }

        // 自动同意逻辑（无论是否配置管理员均可生效）
        if (config.invite.autoApprove) {
            try {
                await handleInviteRequest(session.bot, flag, true);
                // 记录已审核通过（持久化，永久豁免小群检测，退群时清除）
                await markApprovedGuild(ctx, groupId, selfId);
                if (config.invite.showDetailedLog) {
                    console.log(`自动同意群聊邀请: 群号 ${groupId}, 邀请者 ${userId}`);
                }
            } catch (error) {
                console.error('自动同意群聊邀请失败:', error);
                return;
            }

            // 通知邀请者已自动通过
            try {
                const approveMessage = config.invite.inviteApproveMessage
                    .replaceAll('{groupName}', groupName)
                    .replaceAll('{groupId}', groupId)
                    .replaceAll('{userName}', userName)
                    .replaceAll('{userId}', userId);
                await session.bot.sendPrivateMessage(userId, approveMessage);
            } catch (error) {
                console.error(`发送自动通过提示给 ${userId} 失败:`, error);
            }

            // 通知管理员
            if (config.invite.notifyAdminOnApprove) {
                const notifyMessage = config.invite.inviteApproveNotificationMessage
                    .replaceAll('{groupName}', groupName)
                    .replaceAll('{groupId}', groupId)
                    .replaceAll('{userName}', userName)
                    .replaceAll('{userId}', userId);
                await notifyAdmins(session.bot, config, notifyMessage);
            }
            return;
        }

        // 以下为人工审核流程

        // 发送等待审核提示给邀请者
        try {
            const waitMessage = config.invite.inviteWaitMessage
                .replaceAll('{groupName}', groupName)
                .replaceAll('{groupId}', groupId)
                .replaceAll('{userName}', userName)
                .replaceAll('{userId}', userId);

            await session.bot.sendPrivateMessage(userId, waitMessage);
        } catch (error) {
            console.error(`发送等待审核提示给 ${userId} 失败:`, error);
        }

        // 未配置管理员时，无人审核，直接返回
        if (!config.admin.adminQQs || config.admin.adminQQs.length === 0) {
            return;
        }

        // 存储邀请信息到数据库
        await addPendingInvite(ctx, platform, selfId, {
            groupId: groupId,
            userId: userId,
            userName: userName,
            groupName: groupName,
            time: Math.floor(Date.now() / 1000),
            flag: flag
        });

        const requestMessage = config.invite.inviteRequestMessage
            .replaceAll('{groupName}', groupName)
            .replaceAll('{groupId}', groupId)
            .replaceAll('{userName}', userName)
            .replaceAll('{userId}', userId);

        await notifyAdmins(session.bot, config, requestMessage);
        if (config.invite.showDetailedLog) {
            console.log('已发送群邀请审核通知');
        }
    });

    // ======== 注册审核指令 ========
    const cmdOpts = getAdminCommandOptions(config);

    // 同意邀请指令
    ctx.command('gc.approve <groupId:string>', '同意群聊邀请', cmdOpts)
        .action(async ({ session }, groupId) => {
            if (!groupId) return '请指定群号。用法：gc.approve <群号>';
            groupId = parseGuildId(groupId);
            if (!groupId) return '输入格式错误，请输入群号。';
            const selfId = getBotSelfId(session.bot);
            if (!selfId) return '无法识别当前机器人账号，已取消操作。';

            // 验证是否为管理员
            if (!hasGlobalPermission(session, config)) return '权限不足，只有管理员可以审核邀请。';

            // 黑名单拦截：若群已在黑名单中，拒绝通过审核（否则机器人进群后会被立即踢出）
            if (config.basic.enableBlacklist) {
                const bl = await getBlacklistedGuild(ctx, groupId);
                if (bl.length > 0) {
                    return `群 ${groupId} 在黑名单中，无法通过审核。如需放行请先执行 gc.unban ${groupId}。`;
                }
            }

            const inviteData = await getPendingInvite(ctx, session.platform, groupId, selfId);
            if (!inviteData) {
                const allInvites = await getAllPendingInvites(ctx, session.platform, selfId);
                return `未找到群号 ${groupId} 的待处理邀请。当前待处理邀请：${allInvites.length > 0
                    ? allInvites.map(i => `${i.groupId}(${i.groupName})`).join(', ')
                    : '无'
                    }`;
            }

            try {
                await handleInviteRequest(session.bot, inviteData.flag, true);

                // 记录已审核通过，防止小群自动退群
                await markApprovedGuild(ctx, groupId, selfId);

                // 通知邀请者
                try {
                    await session.bot.sendPrivateMessage(inviteData.userId, `您的群聊邀请已通过管理员审核，机器人已加入群聊。`);
                } catch (error) {
                    console.error('通知邀请者失败:', error);
                }

                await removePendingInvite(ctx, session.platform, groupId, selfId);
                return `已同意加入群 ${groupId}（${inviteData.groupName}），邀请者：${inviteData.userName}`;
            } catch (error) {
                console.error('处理同意邀请失败:', error);
                return `处理同意邀请失败: ${error.message}`;
            }
        });

    // 拒绝邀请指令
    ctx.command('gc.reject <groupId:string>', '拒绝群聊邀请', cmdOpts)
        .action(async ({ session }, groupId) => {
            if (!groupId) return '请指定群号。用法：gc.reject <群号>';
            groupId = parseGuildId(groupId);
            if (!groupId) return '输入格式错误，请输入群号。';
            const selfId = getBotSelfId(session.bot);
            if (!selfId) return '无法识别当前机器人账号，已取消操作。';

            // 验证是否为管理员
            if (!hasGlobalPermission(session, config)) return '权限不足，只有管理员可以审核邀请。';

            const inviteData = await getPendingInvite(ctx, session.platform, groupId, selfId);
            if (!inviteData) {
                const allInvites = await getAllPendingInvites(ctx, session.platform, selfId);
                return `未找到群号 ${groupId} 的待处理邀请。当前待处理邀请：${allInvites.length > 0
                    ? allInvites.map(i => `${i.groupId}(${i.groupName})`).join(', ')
                    : '无'
                    }`;
            }

            try {
                await handleInviteRequest(session.bot, inviteData.flag, false, '已拒绝');

                // 通知邀请者
                try {
                    await session.bot.sendPrivateMessage(inviteData.userId, `您的群聊邀请未通过管理员审核，机器人将不会加入该群聊。`);
                } catch (error) {
                    console.error('通知邀请者失败:', error);
                }

                await removePendingInvite(ctx, session.platform, groupId, selfId);
                return `已拒绝加入群 ${groupId}（${inviteData.groupName}），邀请者：${inviteData.userName}`;
            } catch (error) {
                console.error('处理拒绝邀请失败:', error);
                return `处理拒绝邀请失败: ${error.message}`;
            }
        });

    // 查看待处理邀请指令
    ctx.command('gc.pending', '查看待处理的群聊邀请', cmdOpts)
        .action(async ({ session }) => {
            if (!hasGlobalPermission(session, config)) {
                return '权限不足，只有管理员可以查看待处理邀请。';
            }
            const selfId = getBotSelfId(session.bot);
            if (!selfId) return '无法识别当前机器人账号，已取消操作。';

            const allInvites = await getAllPendingInvites(ctx, session.platform, selfId);
            if (allInvites.length === 0) {
                return '当前没有待处理的群聊邀请。';
            }

            const lines = ['待处理的群聊邀请列表：'];
            for (const invite of allInvites) {
                const elapsed = Math.floor((Date.now() / 1000 - invite.time) / 60);
                lines.push(`- 群：${invite.groupName}（${invite.groupId}）`);
                lines.push(`  邀请者：${invite.userName}（${invite.userId}）`);
                lines.push(`  ${elapsed} 分钟前`);
                lines.push(`  同意：gc.approve ${invite.groupId} | 拒绝：gc.reject ${invite.groupId}`);
            }
            return lines.join('\n');
        });
}
