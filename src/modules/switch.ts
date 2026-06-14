import { Context } from 'koishi'
import { Config } from '../config'
import { getGroupBotStatus, setGroupBotStatus } from '../database'
import { hasGuildPermission, ADMIN_COMMANDS } from '../utils'

export const name = 'group-control-switch'

function normalizeCommandName(name: string, prefixes: string[] = []): string {
    let source = name.trim();
    for (const prefix of prefixes.filter(Boolean).sort((a, b) => b.length - a.length)) {
        if (source.startsWith(prefix)) {
            source = source.slice(prefix.length);
            break;
        }
    }
    return source.replace(/^[/.!！。]+/, '').toLowerCase().replace(/_/g, '-');
}

function getCommandNames(command: any): string[] {
    const names = new Set<string>();
    if (command?.name) names.add(normalizeCommandName(command.name));
    if (command?.displayName) names.add(normalizeCommandName(command.displayName));
    for (const alias of Object.keys(command?._aliases ?? {})) {
        names.add(normalizeCommandName(alias));
    }
    return [...names];
}

function isAdminCommand(command: any): boolean {
    return getCommandNames(command).some(commandName => ADMIN_COMMANDS.has(commandName));
}

function getCommandPrefixes(ctx: Context, session: any): string[] {
    const configured = session.resolve?.(ctx.root.config.prefix as any) ?? ctx.root.config.prefix;
    const prefixes = Array.isArray(configured) ? configured : [configured || ''];
    return [...prefixes, '/', '.', '!', '！', '。'];
}

function stripLeadingBotMentions(content: string): string {
    return content
        .replace(/^(?:\s*<at\b[^>]*(?:\/>|>\s*<\/at>))+\s*/i, '')
        .replace(/^(?:\s*\[CQ:at,[^\]]+\])+\s*/i, '');
}

function getMessageCommandName(ctx: Context, session: any): string | null {
    const strippedContent = session.stripped?.content?.trim();
    const content = stripLeadingBotMentions(strippedContent ? session.stripped.content : session.content ?? '');
    const firstWord = content.match(/^\s*(\S+)/)?.[1];
    return firstWord ? normalizeCommandName(firstWord, getCommandPrefixes(ctx, session)) : null;
}

export function apply(ctx: Context, config: Config) {
    // ======== 自定义指令权限保护 ========
    // 无论 botSwitch 是否启用，只要配置了 protectedCommands 就生效
    if (config.permission.protectedCommands?.length > 0) {
        const protectedSet = new Set(config.permission.protectedCommands.map(commandName => normalizeCommandName(commandName)));

        ctx.on('command/before-execute', async (argv) => {
            const session = argv.session;
            if (!session.guildId) return; // 仅限群聊

            const commandNames = getCommandNames(argv.command);
            if (!commandNames.some(commandName => protectedSet.has(commandName))) return; // 不在保护列表中

            const hasPerm = await hasGuildPermission(session, config);
            if (!hasPerm) {
                return '权限不足，只有群管理员可以使用此指令。';
            }
        }, true);
    }

    // ======== Bot 开关功能 ========
    if (!config.botSwitch?.enabled) return;

    const cmdOpts: any = {};
    if (config.permission.mode === 'koishi') {
        cmdOpts.authority = config.permission.koishiAuthority;
    }

    // 添加命令 bot-on 
    ctx.command('bot-on', '开启机器人', cmdOpts)
        .action(async ({ session }) => {
            if (!session.guildId) return '该指令只能在群聊中使用。';

            if (config.permission.mode === 'builtin') {
                const hasPerm = await hasGuildPermission(session, config);
                if (!hasPerm) return '权限不足，只有群管理员可以使用此指令。';
            }

            await setGroupBotStatus(ctx, session.platform, session.guildId, true);
            return '机器人已在此群开启。';
        });

    // 添加命令 bot-off
    ctx.command('bot-off', '关闭机器人', cmdOpts)
        .action(async ({ session }) => {
            if (!session.guildId) return '该指令只能在群聊中使用。';

            if (config.permission.mode === 'builtin') {
                const hasPerm = await hasGuildPermission(session, config);
                if (!hasPerm) return '权限不足，只有群管理员可以使用此指令。';
            }

            await setGroupBotStatus(ctx, session.platform, session.guildId, false);
            return '机器人已在此群关闭。所有指令和主动响应（入群欢迎、链接解析等）将被阻止。使用 bot-on 重新开启。';
        });

    // 拦截除管理指令以外的所有指令
    ctx.on('command/before-execute', async (argv) => {
        const session = argv.session;
        if (!session.guildId) return; // 仅限群聊

        // 允许管理指令
        if (isAdminCommand(argv.command)) {
            return;
        }

        const status = await getGroupBotStatus(ctx, session.platform, session.guildId);
        const isBotEnabled = status ? status.botEnabled : config.botSwitch.defaultState;

        if (!isBotEnabled) {
            // 检查是否有 @ 机器人
            const isMentioned = session.elements?.some(e => e.type === 'at' && e.attrs.id === session.bot.userId);
            if (isMentioned && config.botSwitch.disabledMessage) {
                try {
                    await session.send(config.botSwitch.disabledMessage);
                } catch (e) {
                    ctx.logger('group-control-switch').warn('发送关闭提示失败', e);
                }
            }
            return '';
        }
    }, true);

    // 中间件：阻止关闭状态下的所有非指令响应（入群欢迎、链接解析等其他插件的处理）
    ctx.middleware(async (session, next) => {
        if (!session.guildId) return next();

        const status = await getGroupBotStatus(ctx, session.platform, session.guildId);
        const isBotEnabled = status ? status.botEnabled : config.botSwitch.defaultState;

        if (isBotEnabled) {
            return next(); // 如果已开启，则放行
        }
        // 放行管理指令
        const commandName = session.argv?.command && isAdminCommand(session.argv.command)
            ? session.argv.command.name
            : getMessageCommandName(ctx, session);
        if (commandName && ADMIN_COMMANDS.has(normalizeCommandName(commandName))) {
            return next();
        }
        // 在已关闭状态下：
        // 检查是否有 @ 机器人
        const isMentioned = session.elements?.some(e => e.type === 'at' && e.attrs.id === session.bot.userId);
        if (isMentioned && config.botSwitch.disabledMessage) {
            try {
                await session.send(config.botSwitch.disabledMessage);
            } catch (e) { }
        }

        // 不调用 next() 以阻断所有后续中间件（包括其他插件的响应）
        return;
    }, true); // prepend = true, 优先于其他中间件执行
}
