import { Context, Command, Session } from 'koishi'
import { Config } from '../config'
import { getGroupBotStatus, setGroupBotStatus } from '../database'
import { hasGuildPermission, ADMIN_COMMANDS, normalizeCommandName, getCommandNames, isAdminCommand } from '../utils'
import { createLogger } from '../logger'

export const name = 'group-control-switch'

const SCOPE = 'group-control:switch'

function getCommandPrefixes(ctx: Context, session: Session): string[] {
    const rootConfigPrefix = (ctx.root.config as { prefix?: string | string[] | ((s: Session) => string | string[]) }).prefix
    const sessionResolve = (session as Session & { resolve?: (v: unknown) => unknown }).resolve
    const resolved = sessionResolve ? sessionResolve(rootConfigPrefix) : rootConfigPrefix
    // resolved 仍可能是函数（resolve 不可用时），统一兜底成字符串数组
    const configured = typeof resolved === 'function' ? '' : resolved
    const prefixes: string[] = Array.isArray(configured)
        ? configured.filter((p): p is string => typeof p === 'string')
        : [typeof configured === 'string' ? configured : '']
    return [...prefixes, '/', '.', '!', '！', '。']
}

function stripLeadingBotMentions(content: string): string {
    return content
        .replace(/^(?:\s*<at\b[^>]*(?:\/>|>\s*<\/at>))+\s*/i, '')
        .replace(/^(?:\s*\[CQ:at,[^\]]+\])+\s*/i, '')
}

function getMessageCommandName(ctx: Context, session: Session): string | null {
    const stripped = (session as Session & { stripped?: { content?: string } }).stripped
    const strippedContent = stripped?.content?.trim()
    const content = strippedContent ? stripped!.content! : session.content ?? ''

    const prefixes = getCommandPrefixes(ctx, session)
    const hasPrefix = prefixes.some(p => p && content.startsWith(p))
    const isMentioned = session.elements?.some(e => e.type === 'at' && e.attrs?.id === session.bot?.userId)

    if (!hasPrefix && !isMentioned) {
        return null
    }

    const cleanContent = stripLeadingBotMentions(content.trim())
    const firstWord = cleanContent.match(/^\s*(\S+)/)?.[1]
    return firstWord ? normalizeCommandName(firstWord, prefixes) : null
}

export function apply(ctx: Context, config: Config) {
    const logger = createLogger(ctx, SCOPE, config)

    // ======== 自定义指令权限保护 ========
    if (config.permission.protectedCommands?.length > 0) {
        const protectedSet = new Set(config.permission.protectedCommands.map(commandName => normalizeCommandName(commandName)))

        ctx.on('command/before-execute', async (argv) => {
            const session = argv.session
            if (!session) return
            if (!session.guildId) return // 仅限群聊

            const commandNames = getCommandNames(argv.command)
            if (!commandNames.some(commandName => protectedSet.has(commandName))) return // 不在保护列表中

            const hasPerm = await hasGuildPermission(session, config)
            if (!hasPerm) {
                return '权限不足，只有群管理员可以使用此指令。'
            }
        }, true)
    }

    // ======== Bot 开关功能 ========
    if (!config.botSwitch?.enabled) return

    const cmdOpts: Record<string, unknown> = {}
    if (config.permission.mode === 'koishi') {
        cmdOpts.authority = config.permission.koishiAuthority
    }

    // 添加命令 bot-on
    ctx.command('bot-on', '开启机器人', cmdOpts)
        .action(async ({ session }) => {
            if (!session) return ''
            if (!session.guildId) return '该指令只能在群聊中使用。'

            if (config.permission.mode === 'builtin') {
                const hasPerm = await hasGuildPermission(session, config)
                if (!hasPerm) return '权限不足，只有群管理员可以使用此指令。'
            }

            await setGroupBotStatus(ctx, session.platform, session.guildId, true)
            return '机器人已在此群开启。'
        })

    // 添加命令 bot-off
    ctx.command('bot-off', '关闭机器人', cmdOpts)
        .action(async ({ session }) => {
            if (!session) return ''
            if (!session.guildId) return '该指令只能在群聊中使用。'

            if (config.permission.mode === 'builtin') {
                const hasPerm = await hasGuildPermission(session, config)
                if (!hasPerm) return '权限不足，只有群管理员可以使用此指令。'
            }

            await setGroupBotStatus(ctx, session.platform, session.guildId, false)
            return '机器人已在此群关闭。所有指令和主动响应（入群欢迎、链接解析等）将被阻止。使用 bot-on 重新开启。'
        })

    // 拦截除管理指令以外的所有指令
    ctx.on('command/before-execute', async (argv) => {
        const session = argv.session
        if (!session) return
        if (!session.guildId) return // 仅限群聊

        // 允许管理指令
        if (isAdminCommand(argv.command)) {
            return
        }

        const status = await getGroupBotStatus(ctx, session.platform, session.guildId)
        const isBotEnabled = status ? status.botEnabled : config.botSwitch.defaultState

        if (!isBotEnabled) {
            // 检查是否有 @ 机器人
            const isMentioned = session.elements?.some(e => e.type === 'at' && e.attrs?.id === session.bot.userId)
            if (isMentioned && config.messages.botDisabledMessage) {
                try {
                    await session.send(config.messages.botDisabledMessage)
                } catch (err) {
                    logger.warn('发送关闭提示失败', err)
                }
            }
            return ''
        }
    }, true)

    // 中间件：阻止关闭状态下的所有非指令响应
    ctx.middleware(async (session, next) => {
        if (!session.guildId) return next()

        const status = await getGroupBotStatus(ctx, session.platform, session.guildId)
        const isBotEnabled = status ? status.botEnabled : config.botSwitch.defaultState

        if (isBotEnabled) {
            return next()
        }
        // 放行管理指令
        const argvCommand = (session as Session & { argv?: { command?: Command } }).argv?.command
        const commandName = argvCommand && isAdminCommand(argvCommand)
            ? argvCommand.name
            : getMessageCommandName(ctx, session)
        if (commandName && ADMIN_COMMANDS.has(normalizeCommandName(commandName))) {
            return next()
        }
        // 在已关闭状态下：检查是否有 @ 机器人
        const isMentioned = session.elements?.some(e => e.type === 'at' && e.attrs?.id === session.bot.userId)
        if (isMentioned && config.messages.botDisabledMessage) {
            try {
                await session.send(config.messages.botDisabledMessage)
            } catch { /* 忽略发送失败 */ }
        }

        // 不调用 next() 以阻断所有后续中间件
        return
    }, true)
}
