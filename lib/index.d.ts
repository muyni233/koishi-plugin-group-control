import { Context, Schema } from 'koishi';
export declare const name = "group-control";
export interface Config {
    welcomeMessage: string;
    blacklistMessage: string;
    quitMessage: string;
    enableBlacklist: boolean;
    quitCommandEnabled: boolean;
    quitCommandAuthority: number;
    enabled: boolean;
    limit: number;
    window: number;
    warnDelay: number;
    blockDur: number;
    warnMsg: string;
    blockMsg: string;
    blockedMsg: string;
    whitelist: string[];
}
export interface BlacklistedGuild {
    platform: string;
    guildId: string;
    timestamp: number;
    reason: string;
}
export interface CommandFrequencyRecord {
    platform: string;
    guildId: string;
    commandCount: number;
    lastCommandTime: number;
    warningSent: boolean;
    blockExpiryTime: number;
    firstWarningTime: number;
}
declare module 'koishi' {
    interface Tables {
        blacklisted_guild: BlacklistedGuild;
        command_frequency_record: CommandFrequencyRecord;
    }
}
export interface GroupConfig {
    welcomeMessage: string;
    blacklistMessage: string;
    quitMessage: string;
    enableBlacklist: boolean;
    quitCommandEnabled: boolean;
    quitCommandAuthority: number;
}
export interface FrequencyConfig {
    enabled: boolean;
    limit: number;
    window: number;
    warnDelay: number;
    blockDur: number;
    warnMsg: string;
    blockMsg: string;
    blockedMsg: string;
    whitelist: string[];
}
export interface Config {
    basic: GroupConfig;
    frequency: FrequencyConfig;
}
export declare const Config: Schema<Config>;
export declare function apply(ctx: Context, config: Config): void;
