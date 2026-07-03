import { Context, Logger } from 'koishi'
import { Config } from './config'

/**
 * 统一日志接口。每个模块通过 createLogger(ctx, scope, config) 获取一个实例，
 * 模块内一律走它，禁止再用 console.* 或裸 ctx.logger。
 *
 * 设计原则：
 *   - 前缀统一：scope 由 koishi 的 ctx.logger(scope) 负责，模块内不再手写 [xxx]。
 *   - error 接受 unknown：避免每个 catch 都重复写 `e instanceof Error ? e.message : ...`。
 *   - event(name, fields) 输出 `[name] k=v k=v` 风格的结构化串，
 *     用于事件触发/状态变化等可被 grep 的关键日志，替代旧的手写 `[guild-added] ...` 前缀。
 *   - 全局 verbose 开关：debug 与 detail 等细节日志只在 config.logging.verbose 开启时输出。
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
    /** 是否输出 debug 级别日志，对应 config.logging.verbose */
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

/** 把 unknown 异常转成可读字符串（保留 stack）。仅 logger 内部用于 error/warn 展开。 */
function errorDetail(err: unknown): string {
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

/** 从全局 Config 读取是否开启详细日志，统一由 config.logging.verbose 控制 */
export function isVerbose(config: Config): boolean {
    return config.logging?.verbose ?? false
}

/**
 * 创建一个 ScopedLogger。
 *
 * 两个重载对应两种调用方式：
 *   - createLogger(ctx, scope, config)：从全局 Config 读 config.logging.verbose
 *   - createLogger(ctx, scope, options)：直接传 { verbose: boolean }
 * 不传第三参时 verbose 取默认值 false。
 */
export function createLogger(ctx: Context, scope: string, config: Config): ScopedLogger
export function createLogger(ctx: Context, scope: string, options: LoggerOptions): ScopedLogger
export function createLogger(ctx: Context, scope: string): ScopedLogger
export function createLogger(ctx: Context, scope: string, optionsOrConfig?: LoggerOptions | Config): ScopedLogger {
    const base: Logger = ctx.logger(scope)
    let verbose = false
    if (optionsOrConfig !== undefined) {
        // LoggerOptions 是 { verbose?: boolean }；Config 的顶层没有 boolean 类型的 verbose
        // 字段（其 verbose 在 config.logging.verbose 嵌套里），故用 typeof 一次性区分两种形态，
        // 比起 'verbose' in obj 的存在性判别更贴合类型结构，也不会被空对象误判。
        const maybeVerbose = (optionsOrConfig as { verbose?: unknown }).verbose
        verbose = typeof maybeVerbose === 'boolean'
            ? maybeVerbose
            : isVerbose(optionsOrConfig as Config)
    }

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
