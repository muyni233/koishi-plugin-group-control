import { Context, Schema } from 'koishi';
export declare const name = "group-control";
export interface Config {
    welcomeMessage: string;
    blacklistMessage: string;
    quitMessage: string;
    enableBlacklist: boolean;
    quitCommandEnabled: boolean;
    quitCommandAuthority: number;
}
export interface BlacklistedGuild {
    platform: string;
    guildId: string;
    timestamp: number;
    reason: string;
}
declare module 'koishi' {
    interface Tables {
        blacklisted_guild: BlacklistedGuild;
    }
}
export declare const Config: Schema<Config>;
export declare function apply(ctx: Context, config: Config): void;
