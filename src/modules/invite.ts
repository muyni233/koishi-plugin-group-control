import { Context } from 'koishi'
import { Config } from '../config'
import { approvedGroups } from '../state'
import { hasGlobalPermission } from '../utils'
import {
    getPendingInvite, addPendingInvite, removePendingInvite,
    getAllPendingInvites, clearExpiredPendingInvites
} from '../database'

export const name = 'group-control-invite'

export function apply(ctx: Context, config: Config) {
    if (!config.invite.enabled) return;

    // 定期清理超时的邀请（比如每天一次，或者按需，这里每小时检查一次）
    setInterval(async () => {
        const expireMs = config.invite.inviteExpireDays * 24 * 60 * 60 * 1000;
        try {
            const count = await clearExpiredPendingInvites(ctx, expireMs);
            if (count > 0 && config.invite.showDetailedLog) {
                console.log(`已自动清理 ${count} 个过期邀请`);
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

        // 提取 flag
        const flag = raw.flag || (session as any).flag || session.messageId;

        // 提取真实的 user_id 和 group_id
        const rawUserId = raw.user_id ? String(raw.user_id) : session.userId;
        const rawGroupId = raw.group_id ? String(raw.group_id) : session.guildId;

        const { platform } = session;

        if (!flag && config.invite.showDetailedLog) {
            console.warn('未能提取到邀请 flag，可能导致无法处理邀请。Raw event:', JSON.stringify(raw));
        }

        if (config.invite.showDetailedLog) {
            console.log(`收到群邀请事件 - 原始数据: UserID=${raw.user_id}, GroupID=${raw.group_id}, Flag=${flag}`);
        }

        // 获取邀请者信息
        let userName = rawUserId;
        try {
            const userInfo = await session.bot.getUser(rawUserId);
            userName = userInfo?.nickname || userInfo?.name || rawUserId;
        } catch (error) {
            console.error('获取用户信息失败:', error);
        }

        // 获取群信息
        let groupName = rawGroupId;
        try {
            const guildInfo = await session.bot.getGuild(rawGroupId) as any;
            groupName = guildInfo?.name || guildInfo?.group_name || rawGroupId;
        } catch (error) {
            console.error('获取群信息失败:', error);
        }

        // 发送等待审核提示给邀请者
        try {
            const waitMessage = config.invite.inviteWaitMessage
                .replaceAll('{groupName}', groupName)
                .replaceAll('{groupId}', rawGroupId)
                .replaceAll('{userName}', userName)
                .replaceAll('{userId}', rawUserId);

            await session.bot.sendPrivateMessage(rawUserId, waitMessage);
        } catch (error) {
            console.error(`发送等待审核提示给 ${rawUserId} 失败:`, error);
        }

        // 自动同意逻辑（无论是否配置管理员均可生效）
        if (config.invite.autoApprove) {
            try {
                await session.bot.internal.setGroupAddRequest(flag, 'invite', true, '');
                // 记录已审核通过
                approvedGroups.add(rawGroupId);
                if (config.invite.showDetailedLog) {
                    console.log(`自动同意群聊邀请: 群号 ${rawGroupId}, 邀请者 ${rawUserId}`);
                }
            } catch (error) {
                console.error('自动同意群聊邀请失败:', error);
            }
            return;
        }

        // 未配置管理员且未开启自动同意时，直接返回
        if (!config.admin.adminQQs || config.admin.adminQQs.length === 0) {
            return;
        }

        // 存储邀请信息到数据库
        await addPendingInvite(ctx, {
            groupId: rawGroupId,
            userId: rawUserId,
            userName: userName,
            groupName: groupName,
            time: Math.floor(Date.now() / 1000),
            flag: flag
        });

        const requestMessage = config.invite.inviteRequestMessage
            .replaceAll('{groupName}', groupName)
            .replaceAll('{groupId}', rawGroupId)
            .replaceAll('{userName}', userName)
            .replaceAll('{userId}', rawUserId);

        let requestSent = false;

        // 1. 发送到通知群
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

        // 2. 发送私聊给管理员
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
            console.warn('群邀请请求发送失败：未配置通知群且管理员私聊发送失败');
        }
    });

    // ======== 注册审核指令 ========

    // 同意邀请指令
    ctx.command('gc.approve <groupId:string>', '同意群聊邀请')
        .action(async ({ session }, groupId) => {
            if (!groupId) return '请指定群号。用法：gc.approve <群号>';

            // 验证是否为管理员
            if (!hasGlobalPermission(session, config)) return '权限不足，只有管理员可以审核邀请。';

            const inviteData = await getPendingInvite(ctx, groupId);
            if (!inviteData) {
                const allInvites = await getAllPendingInvites(ctx);
                return `未找到群号 ${groupId} 的待处理邀请。当前待处理邀请：${allInvites.length > 0
                    ? allInvites.map(i => `${i.groupId}(${i.groupName})`).join(', ')
                    : '无'
                    }`;
            }

            try {
                await session.bot.internal.setGroupAddRequest(inviteData.flag, 'invite', true, '');

                // 记录已审核通过，防止小群自动退群
                approvedGroups.add(groupId);

                // 通知邀请者
                try {
                    await session.bot.sendPrivateMessage(inviteData.userId, `您的群聊邀请已通过管理员审核，机器人已加入群聊。`);
                } catch (error) {
                    console.error('通知邀请者失败:', error);
                }

                await removePendingInvite(ctx, groupId);
                return `已同意加入群 ${groupId}（${inviteData.groupName}），邀请者：${inviteData.userName}`;
            } catch (error) {
                console.error('处理同意邀请失败:', error);
                return `处理同意邀请失败: ${error.message}`;
            }
        });

    // 拒绝邀请指令
    ctx.command('gc.reject <groupId:string>', '拒绝群聊邀请')
        .action(async ({ session }, groupId) => {
            if (!groupId) return '请指定群号。用法：gc.reject <群号>';

            // 验证是否为管理员
            if (!hasGlobalPermission(session, config)) return '权限不足，只有管理员可以审核邀请。';

            const inviteData = await getPendingInvite(ctx, groupId);
            if (!inviteData) {
                const allInvites = await getAllPendingInvites(ctx);
                return `未找到群号 ${groupId} 的待处理邀请。当前待处理邀请：${allInvites.length > 0
                    ? allInvites.map(i => `${i.groupId}(${i.groupName})`).join(', ')
                    : '无'
                    }`;
            }

            try {
                await session.bot.internal.setGroupAddRequest(inviteData.flag, 'invite', false, '已拒绝');

                // 通知邀请者
                try {
                    await session.bot.sendPrivateMessage(inviteData.userId, `您的群聊邀请未通过管理员审核，机器人将不会加入该群聊。`);
                } catch (error) {
                    console.error('通知邀请者失败:', error);
                }

                await removePendingInvite(ctx, groupId);
                return `已拒绝加入群 ${groupId}（${inviteData.groupName}），邀请者：${inviteData.userName}`;
            } catch (error) {
                console.error('处理拒绝邀请失败:', error);
                return `处理拒绝邀请失败: ${error.message}`;
            }
        });

    // 查看待处理邀请指令
    ctx.command('gc.pending', '查看待处理的群聊邀请')
        .action(async ({ session }) => {
            if (!config.admin.adminQQs.includes(session.userId)) {
                return '权限不足，只有管理员可以查看待处理邀请。';
            }

            const allInvites = await getAllPendingInvites(ctx);
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
