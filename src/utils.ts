import { Context, Session } from 'koishi'
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

/**
 * 检查用户是否有管理权限
 * - koishi 模式: 使用 Koishi 自带的 authority 系统
 * - builtin 模式: 检查用户是否为群管理员/群主，或在管理员QQ列表中
 */
export async function hasPermission(session: Session, config: Config): Promise<boolean> {
    if (config.permission.mode === 'koishi') {
        // Koishi 权限模式：通过 authority 判断（指令的 authority 配置自动处理，这里返回 true）
        // 如果使用此函数做额外检查，检查 user.authority
        try {
            const user = session.user as any;
            if (user && typeof user.authority === 'number') {
                return user.authority >= config.permission.koishiAuthority;
            }
        } catch { }
        return false;
    }

    // 内置权限模式：检查群管理员/群主 + 管理员QQ列表
    const userId = session.userId;

    // 检查是否在管理员QQ列表中
    if (config.invite.adminQQs?.includes(userId)) {
        return true;
    }

    // 检查是否为群管理员或群主
    try {
        const member = await session.bot.getGuildMember(session.guildId, userId);
        const roles = (member as any)?.roles || (member as any)?.role;
        if (roles) {
            if (Array.isArray(roles)) {
                return roles.some((r: string) => r === 'admin' || r === 'owner');
            }
            return roles === 'admin' || roles === 'owner' || roles === 'administrator';
        }
        // OneBot 的 role 字段
        const role = (member as any)?.role;
        if (role === 'admin' || role === 'owner') return true;
    } catch (error) {
        // 获取成员信息失败时，尝试用 OneBot 内部 API
        try {
            const info = await (session.bot as any).internal?.getGroupMemberInfo?.(
                parseInt(session.guildId), parseInt(userId)
            );
            if (info) {
                return info.role === 'admin' || info.role === 'owner';
            }
        } catch { }
    }

    return false;
}

/** 管理指令列表 - 这些指令始终不受 bot-off 影响 */
export const ADMIN_COMMANDS = new Set([
    'bot-on', 'bot-off', 'quit',
    'view-blacklist', 'remove-from-blacklist', 'add-to-blacklist', 'clear-blacklist',
    'approve', 'reject', 'pending-invites',
    'allow-small-group', 'disallow-small-group', 'view-small-group-whitelist',
]);
