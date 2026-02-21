import { Config } from './config'

export function isBlacklistEnabled(config: Config['basic']): string | null {
    if (!config.enableBlacklist) return '黑名单功能未启用。';
    return null;
}

export function parseGuildId(input: string): string | null {
    const match = input.trim().match(/^onebot:(\d+)$/);
    return match ? match[1] : (/^\d+$/.test(input.trim()) ? input.trim() : null);
}

export function formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString();
}

export async function notifyAdmins(bot: any, config: Config, message: string) {
    if (config.invite.notificationGroupId) {
        try {
            await bot.sendMessage(config.invite.notificationGroupId, message);
            return;
        } catch (error) {
            console.error(`发送通知到通知群 ${config.invite.notificationGroupId} 失败:`, error);
        }
    }
    if (config.invite.adminQQs?.length > 0) {
        for (const adminQQ of config.invite.adminQQs) {
            try {
                await bot.sendPrivateMessage(adminQQ, message);
            } catch (error) {
                console.error(`发送通知给管理员 ${adminQQ} 失败:`, error);
            }
        }
    }
}
