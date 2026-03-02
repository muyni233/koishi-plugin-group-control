import { Schema } from 'koishi';
export interface GroupConfig {
    welcomeMessage: string;
    blacklistMessage: string;
    quitMessage: string;
    enableBlacklist: boolean;
    quitCommandEnabled: boolean;
    notifyAdminOnKick: boolean;
    kickNotificationMessage: string;
    smallGroupAutoQuit: boolean;
    smallGroupThreshold: number;
    smallGroupQuitMessage: string;
    smallGroupNotifyAdmin: boolean;
    smallGroupCheckDelay: number;
}
export interface GroupInviteConfig {
    enabled: boolean;
    adminQQs: string[];
    notificationGroupId: string;
    inviteWaitMessage: string;
    inviteRequestMessage: string;
    autoApprove: boolean;
    showDetailedLog: boolean;
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
export interface BotSwitchConfig {
    enabled: boolean;
    defaultState: boolean;
    disabledMessage: string;
}
export interface PermissionConfig {
    mode: 'koishi' | 'builtin';
    koishiAuthority: number;
    protectedCommands: string[];
}
export interface Config {
    basic: GroupConfig;
    frequency: FrequencyConfig;
    invite: GroupInviteConfig;
    botSwitch: BotSwitchConfig;
    permission: PermissionConfig;
}
export declare const Config: Schema<Config>;
