import { Session } from 'koishi';
import { Config } from './config';
export declare function isBlacklistEnabled(config: Config['basic']): string | null;
export declare function parseGuildId(input: string): string | null;
export declare function formatDate(timestamp: number): string;
export declare function notifyAdmins(bot: any, config: Config, message: string): Promise<void>;
/** 是否为全局管理员（填在 adminQQs 里的） */
export declare function isGlobalAdmin(session: Session, config: Config): boolean;
/**
 * 检查群级权限（bot-on/off、quit、protectedCommands）
 * builtin 模式：群管理员或全局管理员均可
 * koishi 模式：由 authority 决定
 */
export declare function hasGuildPermission(session: Session, config: Config): Promise<boolean>;
export declare function hasGlobalPermission(session: Session, config: Config): boolean;
/** 管理指令列表 - 这些指令始终不受 bot-off 影响 */
export declare const ADMIN_COMMANDS: Set<string>;
