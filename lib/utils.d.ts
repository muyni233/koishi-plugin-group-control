import { Session } from 'koishi';
import { Config } from './config';
export declare function isBlacklistEnabled(config: Config['basic']): string | null;
export declare function parseGuildId(input: string): string | null;
export declare function formatDate(timestamp: number): string;
export declare function notifyAdmins(bot: any, config: Config, message: string): Promise<void>;
/**
 * 检查用户是否有管理权限
 * - koishi 模式: 使用 Koishi 自带的 authority 系统
 * - builtin 模式: 检查用户是否为群管理员/群主，或在管理员QQ列表中
 */
export declare function hasPermission(session: Session, config: Config): Promise<boolean>;
/**
 * 检查当前用户是否拥有全局管理权限
 * （供独立于群聊的全局指令（如黑名单、白名单）使用）
 */
export declare function isGlobalAdmin(session: Session, config: Config): boolean;
/** 管理指令列表 - 这些指令始终不受 bot-off 影响 */
export declare const ADMIN_COMMANDS: Set<string>;
