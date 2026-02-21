import { Context } from 'koishi'
import { Config } from '../config'

export const name = 'group-control-invite'

export function apply(ctx: Context, config: Config) {
    if (!config.invite.enabled) return;

    const pendingInvites = new Map<string, { groupId: string, userId: string, userName: string, time: number, flag: string }>();

    // 监听群聊邀请事件
    ctx.on('guild-request', async (session) => {
        // 【关键修复】直接从原始数据获取 ID，避免被 Koishi 截断或映射
        const raw = (session as any).original || (session as any).raw || (session.event as any)?._data || {};

        // 提取 flag
        const flag = raw.flag || (session as any).flag || session.messageId;

        // 提取真实的 user_id 和 group_id (转换为字符串，防止精度丢失)
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
            // 尝试获取群信息，注意这里的 rawGroupId 应该是真实的群号
            const guildInfo = await session.bot.getGuild(rawGroupId) as any;
            groupName = guildInfo?.name || guildInfo?.group_name || rawGroupId;
        } catch (error) {
            console.error('获取群信息失败:', error);
        }

        // 发送等待审核提示给邀请者
        try {
            const waitMessage = config.invite.inviteWaitMessage
                .replace('{groupName}', groupName)
                .replace('{groupId}', rawGroupId)
                .replace('{userName}', userName)
                .replace('{userId}', rawUserId);

            // 【关键修复】强制使用 sendPrivateMessage 确保发私聊
            await session.bot.sendPrivateMessage(rawUserId, waitMessage);
        } catch (error) {
            console.error(`发送等待审核提示给 ${rawUserId} 失败:`, error);
        }

        // 自动同意逻辑
        if (!config.invite.adminQQs || config.invite.adminQQs.length === 0) {
            if (config.invite.autoApprove) {
                try {
                    await session.bot.internal.setGroupAddRequest({
                        flag: flag,
                        sub_type: 'invite',
                        approve: true,
                        reason: '',
                    });
                    if (config.invite.showDetailedLog) {
                        console.log(`自动同意群聊邀请: 群号 ${rawGroupId}, 邀请者 ${rawUserId}`);
                    }
                } catch (error) {
                    console.error('自动同意群聊邀请失败:', error);
                }
            }
            return;
        }

        // 存储邀请信息
        const inviteId = `${rawGroupId}_${rawUserId}_${Date.now()}`;
        pendingInvites.set(inviteId, {
            groupId: rawGroupId,
            userId: rawUserId,
            userName: userName,
            time: Date.now(),
            flag: flag
        });

        const requestMessage = config.invite.inviteRequestMessage
            .replace('{groupName}', groupName)
            .replace('{groupId}', rawGroupId)
            .replace('{userName}', userName)
            .replace('{userId}', rawUserId);

        let requestSent = false;

        // 1. 发送到通知群 (使用 sendMessage)
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

        // 2. 发送私聊给管理员 (使用 sendPrivateMessage)
        if (!config.invite.notificationGroupId) {
            for (const adminQQ of config.invite.adminQQs) {
                try {
                    // 【关键修复】强制使用 sendPrivateMessage
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

    // 监听消息以处理管理员审核回复
    ctx.on('message', async (session) => {
        const { userId, guildId } = session;

        if (!config.invite.adminQQs.includes(userId)) return;

        const isNotificationGroup = config.invite.notificationGroupId && guildId === config.invite.notificationGroupId;
        const isPrivate = !guildId;

        if (!isNotificationGroup && !isPrivate && config.invite.notificationGroupId) return;

        // 检查是否有引用元素
        const hasQuote = session.elements.some(element => element.type === 'quote');
        if (!hasQuote) return;

        // 【修复】从 elements 中提取纯文本内容，过滤掉 quote 和 at 等非文本元素
        const textContent = session.elements
            .filter(element => element.type === 'text')
            .map(element => element.attrs?.content || '')
            .join('')
            .trim();

        if (config.invite.showDetailedLog) {
            console.log(`管理员审核回复 - 原始content: "${session.content}", 提取文本: "${textContent}"`);
        }

        if (!['同意', '拒绝', 'accept', 'reject'].includes(textContent)) return;

        const quoteElement = session.elements.find(element => element.type === 'quote');
        if (!quoteElement) return;

        // 【修复】多种方式获取被引用消息的内容
        let quoteMessageContent = '';

        // 方式1: 从 session.quote 获取
        if (session.quote?.content) {
            quoteMessageContent = session.quote.content;
        }
        // 方式2: 从 quoteElement 的属性获取
        if (!quoteMessageContent) {
            quoteMessageContent = quoteElement.attrs?.content || (quoteElement.attrs as any)?.text || '';
        }
        // 方式3: 从 quoteElement 的子元素获取文本
        if (!quoteMessageContent && quoteElement.children?.length > 0) {
            quoteMessageContent = quoteElement.children
                .filter((child: any) => child.type === 'text')
                .map((child: any) => child.attrs?.content || '')
                .join('');
        }
        // 方式4: 通过消息 ID 获取原始消息
        if (!quoteMessageContent) {
            const quoteId = quoteElement.attrs?.id || session.quote?.id;
            if (quoteId) {
                try {
                    const channelId = guildId || session.channelId;
                    if (channelId) {
                        const originalMsg = await session.bot.getMessage(channelId, quoteId);
                        if (originalMsg?.content) {
                            quoteMessageContent = originalMsg.content;
                        }
                    }
                } catch (error) {
                    if (config.invite.showDetailedLog) {
                        console.error('通过消息ID获取引用消息内容失败:', error);
                    }
                }
            }
        }

        if (config.invite.showDetailedLog) {
            console.log(`引用消息内容: "${quoteMessageContent}"`);
        }

        const groupIdMatch = quoteMessageContent.match(/群号[：:]\s*(\d+)/i);
        const userIdMatch = quoteMessageContent.match(/QQ[：:]\s*(\d+)/i);

        if (groupIdMatch && userIdMatch) {
            const extractedGroupId = groupIdMatch[1];
            const extractedUserId = userIdMatch[1];

            if (config.invite.showDetailedLog) {
                console.log(`提取到群号: ${extractedGroupId}, QQ: ${extractedUserId}`);
            }

            // 查找邀请
            let targetInviteId = null;
            for (const [inviteId, inviteData] of pendingInvites) {
                if (inviteData.groupId === extractedGroupId && inviteData.userId === extractedUserId) {
                    targetInviteId = inviteId;
                    break;
                }
            }

            if (targetInviteId) {
                const inviteData = pendingInvites.get(targetInviteId);
                if (inviteData) {
                    if (textContent === '同意' || textContent === 'accept') {
                        try {
                            await session.bot.internal.setGroupAddRequest({
                                flag: inviteData.flag,
                                sub_type: 'invite',
                                approve: true,
                                reason: '',
                            });

                            await session.send(`已同意加入群 ${inviteData.groupId}`);

                            // 通知邀请者 (使用 sendPrivateMessage)
                            try {
                                await session.bot.sendPrivateMessage(inviteData.userId, `您的群聊邀请已通过管理员审核，机器人已加入群聊。`);
                            } catch (error) {
                                console.error('通知邀请者失败:', error);
                            }
                        } catch (error) {
                            console.error('处理同意邀请失败:', error);
                            await session.send(`处理同意邀请失败: ${error.message}`);
                        }
                    } else { // 拒绝
                        try {
                            await session.bot.internal.setGroupAddRequest({
                                flag: inviteData.flag,
                                sub_type: 'invite',
                                approve: false,
                                reason: '已拒绝',
                            });

                            await session.send(`已拒绝加入群 ${inviteData.groupId}`);

                            // 通知邀请者 (使用 sendPrivateMessage)
                            try {
                                await session.bot.sendPrivateMessage(inviteData.userId, `您的群聊邀请未通过管理员审核，机器人将不会加入该群聊。`);
                            } catch (error) {
                                console.error('通知邀请者失败:', error);
                            }
                        } catch (error) {
                            console.error('处理拒绝邀请失败:', error);
                            await session.send(`处理拒绝邀请失败: ${error.message}`);
                        }
                    }
                    pendingInvites.delete(targetInviteId);
                }
            } else if (config.invite.showDetailedLog) {
                console.log(`未找到匹配的待处理邀请: 群号=${extractedGroupId}, QQ=${extractedUserId}`);
                console.log(`当前待处理邀请列表:`, Array.from(pendingInvites.entries()));
            }
        } else if (config.invite.showDetailedLog) {
            console.log(`无法从引用消息中提取群号或QQ号，引用内容: "${quoteMessageContent}"`);
        }
    });
}
