import { Context } from 'koishi'
import { Config } from '../config'
import { approvedGroups } from '../state'

export const name = 'group-control-invite'

export function apply(ctx: Context, config: Config) {
    if (!config.invite.enabled) return;

    // 存储待处理的邀请，key 为 groupId
    const pendingInvites = new Map<string, {
        groupId: string
        userId: string
        userName: string
        groupName: string
        time: number
        flag: string
    }>();

    // 定期清理超时的邀请（10分钟超时）
    const INVITE_TIMEOUT = 10 * 60 * 1000;
    setInterval(() => {
        const now = Date.now();
        for (const [key, invite] of pendingInvites) {
            if (now - invite.time > INVITE_TIMEOUT) {
                pendingInvites.delete(key);
                if (config.invite.showDetailedLog) {
                    console.log(`邀请超时已清理: 群号=${invite.groupId}, 邀请者=${invite.userId}`);
                }
            }
        }
    }, 60 * 1000);

    // 监听群聊邀请事件
    ctx.on('guild-request', async (session) => {
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

        // 自动同意逻辑
        if (!config.invite.adminQQs || config.invite.adminQQs.length === 0) {
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
            }
            return;
        }

        // 存储邀请信息（以 groupId 为 key，方便管理员使用指令审核）
        pendingInvites.set(rawGroupId, {
            groupId: rawGroupId,
            userId: rawUserId,
            userName: userName,
            groupName: groupName,
            time: Date.now(),
            flag: flag
        });

        const requestMessage = config.invite.inviteRequestMessage
            .replaceAll('{groupName}', groupName)
            .replaceAll('{groupId}', rawGroupId)
            .replaceAll('{userName}', userName)
            .replaceAll('{userId}', rawUserId);

        let requestSent = false;

        // 1. 发送到通知群
        if (config.invite.notificationGroupId) {
            try {
                await session.bot.sendMessage(config.invite.notificationGroupId, requestMessage);
                requestSent = true;
                if (config.invite.showDetailedLog) {
                    console.log(`发送邀请请求到通知群 ${config.invite.notificationGroupId}`);
                }
            } catch (error) {
                console.error(`发送邀请请求到通知群 ${config.invite.notificationGroupId} 失败:`, error);
            }
        }

        // 2. 发送私聊给管理员
        if (!config.invite.notificationGroupId) {
            for (const adminQQ of config.invite.adminQQs) {
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
    ctx.command('approve <groupId:string>', '同意群聊邀请', { authority: 4 })
        .action(async ({ session }, groupId) => {
            if (!groupId) return '请指定群号。用法：approve <群号>';

            // 验证是否为管理员
            if (!config.invite.adminQQs.includes(session.userId)) {
                return '权限不足，只有管理员可以审核邀请。';
            }

            const inviteData = pendingInvites.get(groupId);
            if (!inviteData) {
                return `未找到群号 ${groupId} 的待处理邀请。当前待处理邀请：${pendingInvites.size > 0
                    ? Array.from(pendingInvites.values()).map(i => `${i.groupId}(${i.groupName})`).join(', ')
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

                pendingInvites.delete(groupId);
                return `已同意加入群 ${groupId}（${inviteData.groupName}），邀请者：${inviteData.userName}`;
            } catch (error) {
                console.error('处理同意邀请失败:', error);
                return `处理同意邀请失败: ${error.message}`;
            }
        });

    // 拒绝邀请指令
    ctx.command('reject <groupId:string>', '拒绝群聊邀请', { authority: 4 })
        .action(async ({ session }, groupId) => {
            if (!groupId) return '请指定群号。用法：reject <群号>';

            // 验证是否为管理员
            if (!config.invite.adminQQs.includes(session.userId)) {
                return '权限不足，只有管理员可以审核邀请。';
            }

            const inviteData = pendingInvites.get(groupId);
            if (!inviteData) {
                return `未找到群号 ${groupId} 的待处理邀请。当前待处理邀请：${pendingInvites.size > 0
                    ? Array.from(pendingInvites.values()).map(i => `${i.groupId}(${i.groupName})`).join(', ')
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

                pendingInvites.delete(groupId);
                return `已拒绝加入群 ${groupId}（${inviteData.groupName}），邀请者：${inviteData.userName}`;
            } catch (error) {
                console.error('处理拒绝邀请失败:', error);
                return `处理拒绝邀请失败: ${error.message}`;
            }
        });

    // 查看待处理邀请指令
    ctx.command('pending-invites', '查看待处理的群聊邀请', { authority: 4 })
        .action(async ({ session }) => {
            if (!config.invite.adminQQs.includes(session.userId)) {
                return '权限不足，只有管理员可以查看待处理邀请。';
            }

            if (pendingInvites.size === 0) {
                return '当前没有待处理的群聊邀请。';
            }

            const lines = ['待处理的群聊邀请列表：'];
            for (const [, invite] of pendingInvites) {
                const elapsed = Math.floor((Date.now() - invite.time) / 1000 / 60);
                lines.push(`- 群：${invite.groupName}（${invite.groupId}）`);
                lines.push(`  邀请者：${invite.userName}（${invite.userId}）`);
                lines.push(`  ${elapsed} 分钟前`);
                lines.push(`  同意：approve ${invite.groupId} | 拒绝：reject ${invite.groupId}`);
            }
            return lines.join('\n');
        });
}
