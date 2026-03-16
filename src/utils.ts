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

/** 是否为全局管理员（填在 adminQQs 里的） */
export function isGlobalAdmin(session: Session, config: Config): boolean {
    if (config.permission.mode === 'koishi') {
        const user = session.user as any;
        return typeof user?.authority === 'number' && user.authority >= config.permission.koishiAuthority;
    }
    return config.invite.adminQQs?.includes(session.userId) ?? false;
}

/** 是否为群管理员或群主（仅 builtin 模式使用） */
async function isGuildAdmin(session: Session): Promise<boolean> {
    try {
        const member = await session.bot.getGuildMember(session.guildId, session.userId);
        const role = (member as any)?.role;
        if (role === 'admin' || role === 'owner') return true;
        const roles = (member as any)?.roles;
        if (Array.isArray(roles)) return roles.some((r: string) => r === 'admin' || r === 'owner');
    } catch {
        try {
            const info = await (session.bot as any).internal?.getGroupMemberInfo?.(
                parseInt(session.guildId), parseInt(session.userId)
            );
            if (info?.role === 'admin' || info?.role === 'owner') return true;
        } catch { }
    }
    return false;
}

/**
 * 检查群级权限（bot-on/off、quit、protectedCommands）
 * builtin 模式：群管理员或全局管理员均可
 * koishi 模式：由 authority 决定
 */
export async function hasGuildPermission(session: Session, config: Config): Promise<boolean> {
    if (config.permission.mode === 'koishi') {
        const user = session.user as any;
        return typeof user?.authority === 'number' && user.authority >= config.permission.koishiAuthority;
    }
    if (isGlobalAdmin(session, config)) return true;
    return await isGuildAdmin(session);
}

// 检查全局管理权限（ban/sg-add/approve/reject/pending/friend-approve 等）
// builtin 模式：仅全局管理员（adminQQs）；koishi 模式：由 authority 决定
export function hasGlobalPermission(session: Session, config: Config): boolean {
    return isGlobalAdmin(session, config);
}

/** 管理指令列表 - 这些指令始终不受 bot-off 影响 */
export const ADMIN_COMMANDS = new Set([
    'bot-on', 'bot-off', 'quit',
    'banlist', 'unban', 'ban', 'clearban',
    'approve', 'reject', 'pending',
    'sg-add', 'sg-rm', 'sg-list',
    'friend-pending', 'friend-approve', 'friend-reject',
]);
