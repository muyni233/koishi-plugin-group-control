import { Context } from 'koishi';
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
export interface GroupBotStatus {
    platform: string;
    guildId: string;
    botEnabled: boolean;
}
export interface SmallGroupWhitelist {
    platform: string;
    guildId: string;
}
declare module 'koishi' {
    interface Tables {
        blacklisted_guild: BlacklistedGuild;
        command_frequency_record: CommandFrequencyRecord;
        group_bot_status: GroupBotStatus;
        small_group_whitelist: SmallGroupWhitelist;
    }
}
export declare const name = "group-control-database";
export declare function apply(ctx: Context): void;
export declare const BLACKLIST_PLATFORM = "onebot";
export declare function getBlacklistedGuild(ctx: Context, guildId: string): Promise<BlacklistedGuild[]>;
export declare function removeBlacklistedGuild(ctx: Context, guildId: string): Promise<import("minato").Driver.WriteResult>;
export declare function createBlacklistedGuild(ctx: Context, guildId: string, reason: string): Promise<import("minato").Driver.WriteResult>;
export declare function getAllBlacklistedGuilds(ctx: Context): Promise<BlacklistedGuild[]>;
export declare function clearBlacklistedGuilds(ctx: Context): Promise<import("minato").Driver.WriteResult>;
export declare function getCommandFrequencyRecord(ctx: Context, platform: string, guildId: string): Promise<CommandFrequencyRecord>;
export declare function updateCommandFrequencyRecord(ctx: Context, platform: string, guildId: string, data: Partial<CommandFrequencyRecord>): Promise<void>;
export declare function getGroupBotStatus(ctx: Context, platform: string, guildId: string): Promise<GroupBotStatus | null>;
export declare function setGroupBotStatus(ctx: Context, platform: string, guildId: string, botEnabled: boolean): Promise<void>;
export declare function isInSmallGroupWhitelist(ctx: Context, guildId: string): Promise<boolean>;
export declare function addToSmallGroupWhitelist(ctx: Context, guildId: string): Promise<void>;
export declare function removeFromSmallGroupWhitelist(ctx: Context, guildId: string): Promise<void>;
export declare function getAllSmallGroupWhitelist(ctx: Context): Promise<SmallGroupWhitelist[]>;
