import { Schema } from 'koishi';
export interface GroupConfig {
    welcomeMessage: string;
    quitMessage: string;
    quitCommandEnabled: boolean;
    enableBlacklist: boolean;
    blacklistMessage: string;
    notifyAdminOnKick: boolean;
    kickNotificationMessage: string;
    smallGroupAutoQuit: boolean;
    smallGroupThreshold: number;
    smallGroupQuitMessage: string;
    smallGroupNotifyAdmin: boolean;
    smallGroupCheckDelay: number;
    smallGroupQualifiedNotifyAdmin: boolean;
    smallGroupQualifiedMessage: string;
    notifyAdminOnMute: boolean;
    muteNotificationMessage: string;
}
export interface GroupInviteConfig {
    enabled: boolean;
    adminQQs: string[];
    notificationGroupId: string;
    inviteWaitMessage: string;
    inviteRequestMessage: string;
    autoApprove: boolean;
    showDetailedLog: boolean;
    inviteExpireDays: number;
}
export interface FrequencyConfig {
    enabled: boolean;
    limit: number;
    window: number;
    warnDelay: number;
    blockDur: number;
    whitelist: string[];
    privateEnabled: boolean;
    privateLimit: number;
    privateWindow: number;
    privateWarnDelay: number;
    privateBlockDur: number;
    privateWhitelist: string[];
    blockExpBase: number;
    blockExpWindow: number;
    blockNotifyCooldown: number;
    warnMsg: string;
    blockMsg: string;
    blockedMsg: string;
}
export interface FriendConfig {
    enabled: boolean;
    autoApprove: boolean;
    notifyAdminOnApprove: boolean;
    requestExpireDays: number;
    requestMessage: string;
    approveNotificationMessage: string;
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
    permission: PermissionConfig;
    basic: GroupConfig;
    invite: GroupInviteConfig;
    friend: FriendConfig;
    frequency: FrequencyConfig;
    botSwitch: BotSwitchConfig;
}
export declare const Config: Schema<Config>;
