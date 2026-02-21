import { Config } from './config';
export declare function isBlacklistEnabled(config: Config['basic']): string | null;
export declare function parseGuildId(input: string): string | null;
export declare function formatDate(timestamp: number): string;
export declare function notifyAdmins(bot: any, config: Config, message: string): Promise<void>;
