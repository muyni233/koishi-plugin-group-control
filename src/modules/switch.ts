import { Context } from 'koishi'
import { Config } from '../config'
import { getGroupBotStatus, setGroupBotStatus } from '../database'

export const name = 'group-control-switch'

export function apply(ctx: Context, config: Config) {
    if (!config.botSwitch?.enabled) return;

    // 添加命令 bot-on 
    ctx.command('bot-on', '开启机器人', { authority: config.botSwitch.toggleAuthority })
        .action(async ({ session }) => {
            if (!session.guildId) return '该指令只能在群聊中使用。';
            await setGroupBotStatus(ctx, session.platform, session.guildId, true);
            return '机器人已在此群开启。';
        });

    // 添加命令 bot-off
    ctx.command('bot-off', '关闭机器人', { authority: config.botSwitch.toggleAuthority })
        .action(async ({ session }) => {
            if (!session.guildId) return '该指令只能在群聊中使用。';
            await setGroupBotStatus(ctx, session.platform, session.guildId, false);
            return '机器人已在此群关闭。';
        });

    // 拦截除了 bot-on 和 bot-off 以外的指令
    ctx.on('command/before-execute', async (argv) => {
        const session = argv.session;
        if (!session.guildId) return; // 仅限群聊

        if (argv.command.name === 'bot-on' || argv.command.name === 'bot-off') {
            return; // 允许执行特定的控制指令
        }

        const status = await getGroupBotStatus(ctx, session.platform, session.guildId);
        const isBotEnabled = status ? status.botEnabled : config.botSwitch.defaultState;

        if (!isBotEnabled) {
            // 检查是否有 @ 机器人
            const isMentioned = session.elements?.some(e => e.type === 'at' && e.attrs.id === session.bot.userId);
            if (isMentioned && config.botSwitch.disabledMessage) {
                // 如果被@了发送提示
                try {
                    await session.send(config.botSwitch.disabledMessage);
                } catch (e) {
                    ctx.logger('group-control-switch').warn('发送关闭提示失败', e);
                }
            }
            // 如果没有@，则什么也不做。返回空字符串阻断指令继续执行，同时不会输出内容。
            return '';
        }
    }, true /* append，在其他验证之后执行 */);

    // 中间件：处理非指令的普通消息，避免关闭状态下其他插件产生回复
    ctx.middleware(async (session, next) => {
        if (!session.guildId) return next();

        const status = await getGroupBotStatus(ctx, session.platform, session.guildId);
        const isBotEnabled = status ? status.botEnabled : config.botSwitch.defaultState;

        if (isBotEnabled) {
            return next(); // 如果已开启，则放行
        }

        // 在已关闭状态下，由于此中间件执行时非指令消息（因为如果是指令，在 command/before-execute 中已被阻断），
        // 检查是否有 @ 机器人
        const isMentioned = session.elements?.some(e => e.type === 'at' && e.attrs.id === session.bot.userId);
        if (isMentioned && config.botSwitch.disabledMessage) {
            try {
                await session.send(config.botSwitch.disabledMessage);
            } catch (e) { }
        }

        // 无论是否 @ 机器人，关闭状态下都阻断其他消息处理中间件，使得机器人对本群完全静默
        // 不再调用 next() 即可阻断消息被后续的中间件（比如聊天插件等）处理
        return;
    });
}
