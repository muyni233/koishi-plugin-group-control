import { Context } from 'koishi'
import { Config } from '../config'
import { notifyAdmins } from '../utils'

export const name = 'group-control-basic'

export function apply(ctx: Context, config: Config) {
    const quittingGuilds = new Set<string>();

    ctx.on('guild-added', async (session) => {
        const { guildId, platform } = session;

        // 检查黑名单
        if (config.basic.enableBlacklist) {
            const [blacklisted] = await ctx.model.get('blacklisted_guild', { platform, guildId });
            if (blacklisted) {
                try { await session.bot.sendMessage(guildId, config.basic.blacklistMessage, platform); } catch (e) { }
                quittingGuilds.add(`${platform}:${guildId}`);
                try { await session.bot.internal.setGroupLeave(parseInt(guildId)); } catch (e) { }
                return;
            }
        }

        // 小群自动退群检测
        if (config.basic.smallGroupAutoQuit) {
            try {
                const guildInfo = await session.bot.getGuild(guildId) as any;
                const memberCount = guildInfo?.member_count || guildInfo?.memberCount || 0;

                if (memberCount > 0 && memberCount <= config.basic.smallGroupThreshold) {
                    // 发送退群提示
                    const quitMsg = config.basic.smallGroupQuitMessage
                        .replace('{memberCount}', memberCount.toString())
                        .replace('{threshold}', config.basic.smallGroupThreshold.toString());
                    try { await session.bot.sendMessage(guildId, quitMsg, platform); } catch (e) { }

                    // 通知管理员
                    if (config.basic.smallGroupNotifyAdmin) {
                        const adminMsg = `小群自动退群\n群号：${guildId}\n群成员数：${memberCount}人（阈值：${config.basic.smallGroupThreshold}人）\n机器人已自动退出该群。`;
                        await notifyAdmins(session.bot, config, adminMsg);
                    }

                    // 标记为主动退出，避免触发被踢拉黑逻辑
                    quittingGuilds.add(`${platform}:${guildId}`);
                    try { await session.bot.internal.setGroupLeave(parseInt(guildId)); } catch (e) {
                        console.error(`小群自动退群失败 (群号: ${guildId}):`, e);
                        quittingGuilds.delete(`${platform}:${guildId}`);
                    }
                    return;
                }
            } catch (error) {
                console.error(`获取群信息失败 (群号: ${guildId}):`, error);
                // 获取群信息失败时不退群，继续正常流程
            }
        }

        // 发送欢迎消息
        if (config.basic.welcomeMessage) {
            try { await session.bot.sendMessage(guildId, config.basic.welcomeMessage, platform); } catch (e) { }
        }
    });

    ctx.on('guild-removed', async (session) => {
        const { guildId, platform } = session;
        const quittingKey = `${platform}:${guildId}`;

        // 主动退出的不处理
        if (quittingGuilds.has(quittingKey)) {
            quittingGuilds.delete(quittingKey);
            return;
        }

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
                .replace('{groupId}', guildId);
            await notifyAdmins(session.bot, config, kickMsg);
        }
    });

    if (config.basic.quitCommandEnabled) {
        ctx.command('quit', '让机器人主动退出当前群聊', { authority: config.basic.quitCommandAuthority })
            .action(async ({ session }) => {
                if (!session.guildId) return 'quit 指令只能在群聊中使用。';
                const { guildId, platform, userId } = session;
                quittingGuilds.add(`${platform}:${guildId}`);
                try { await session.bot.sendMessage(session.guildId, config.basic.quitMessage.replace('{userId}', userId), platform); } catch (e) { }
                try { await session.bot.internal.setGroupLeave(parseInt(guildId)); } catch (e) {
                    quittingGuilds.delete(`${platform}:${guildId}`);
                    return `退出失败: ${e.message}`;
                }
                return '';
            });
    }
}
