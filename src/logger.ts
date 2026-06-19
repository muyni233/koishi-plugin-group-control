import { Context, Logger } from 'koishi'

/**
 * 统一日志接口。每个模块通过 createLogger(ctx, scope) 获取一个实例，
 * 模块内一律走它，禁止再用 console.* 或裸 ctx.logger。
 *
 * 设计原则：
 *   - 前缀统一：scope 由 koishi 的 ctx.logger(scope) 负责，模块内不再手写 [xxx]。
 *   - error 接受 unknown：避免每个 catch 都重复写 `e instanceof Error ? e.message : ...`。
 *   - event(name, fields) 输出 `[name] k=v k=v` 风格的结构化串，
 *     用于事件触发/状态变化等可被 grep 的关键日志，替代旧的手写 `[guild-added] ...` 前缀。
 *   - verbose 开关：debug 与 detail 等细节日志只在开启时输出，
 *     统一替代旧代码里散落的 `if (config.xxx.showDetailedLog) console.log(...)`。
 */
export interface ScopedLogger {
    /** 关键错误：始终输出。第二个参数支持 unknown，自动展开 Error.stack。 */
    error(message: string, err?: unknown): void
    /** 预期内的失败/可恢复异常：始终输出。 */
    warn(message: string, err?: unknown): void
    /** 正常事件：始终输出。 */
    info(message: string): void
    /** 调试细节：仅在 verbose=true 时输出。 */
    debug(message: string): void
    /**
     * 结构化事件日志，输出形如 `[guild-added] guildId=12345 platform=onebot`。
     * 适合标记关键流程节点，方便 grep 和调试。
     * level 决定日志级别（默认 'info'），结构化字段写在 fields 里。
     */
    event(name: string, fields?: Record<string, unknown>, level?: 'debug' | 'info' | 'warn'): void
}

export interface LoggerOptions {
    /** 是否输出 debug 级别日志，对应旧的 showDetailedLog 等开关 */
    verbose?: boolean
}

function formatField(value: unknown): string {
    if (value === null) return 'null'
    if (value === undefined) return 'undefined'
    if (typeof value === 'string') {
        // 含空格/引号/换行的字符串才加引号，避免 grep 时干扰
        return /[\s"=]/.test(value) ? JSON.stringify(value) : value
    }
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
        return String(value)
    }
    // 对象/数组等：紧凑 JSON
    try {
        return JSON.stringify(value)
    } catch {
        return String(value)
    }
}

function formatFields(fields?: Record<string, unknown>): string {
    if (!fields) return ''
    const parts: string[] = []
    for (const key of Object.keys(fields)) {
        parts.push(`${key}=${formatField(fields[key])}`)
    }
    return parts.length > 0 ? ' ' + parts.join(' ') : ''
}

/** 把 unknown 异常转成可读字符串（保留 stack） */
export function errorDetail(err: unknown): string {
    if (err == null) return ''
    if (err instanceof Error) return err.stack ?? `${err.name}: ${err.message}`
    if (typeof err === 'string') return err
    try {
        return JSON.stringify(err)
    } catch {
        return String(err)
    }
}

/** 把 unknown 异常转成单行 message，用于回复给用户/拼接到字符串 */
export function errorMessage(err: unknown): string {
    if (err == null) return ''
    if (err instanceof Error) return err.message
    if (typeof err === 'string') return err
    try {
        return JSON.stringify(err)
    } catch {
        return String(err)
    }
}

export function createLogger(ctx: Context, scope: string, options: LoggerOptions = {}): ScopedLogger {
    const base: Logger = ctx.logger(scope)
    const verbose = options.verbose ?? false

    return {
        error(message, err) {
            if (err === undefined) {
                base.error(message)
            } else {
                base.error(`${message} ${errorDetail(err)}`)
            }
        },
        warn(message, err) {
            if (err === undefined) {
                base.warn(message)
            } else {
                base.warn(`${message} ${errorDetail(err)}`)
            }
        },
        info(message) {
            base.info(message)
        },
        debug(message) {
            if (verbose) base.info(message)
            else base.debug(message)
        },
        event(name, fields, level = 'info') {
            const line = `[${name}]${formatFields(fields)}`
            if (level === 'warn') base.warn(line)
            else if (level === 'debug') {
                if (verbose) base.info(line)
                else base.debug(line)
            } else base.info(line)
        },
    }
}
