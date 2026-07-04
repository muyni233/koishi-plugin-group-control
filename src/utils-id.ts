/**
 * 纯 ID/数据工具函数。无外部依赖，可被 types.ts、utils.ts、modules 等任意模块共享。
 * 拆出本文件是为了避免 utils.ts ↔ types.ts 循环依赖。
 */

/** 从形如 `onebot:12345` 或 `12345` 的字符串里取出纯数字 ID。无效输入返回 null。 */
export function parseGuildId(input: string | number | undefined | null): string | null {
    if (input == null) return null
    const str = String(input).trim()
    const match = str.match(/^(?:[^:]+:)?(\d+)$/)
    return match ? match[1] : null
}

/** 把 ID 字符串转为 OneBot 接受的纯数字（必须是安全整数），失败返回 null。 */
export function toOneBotNumber(input: string | undefined | null): number | null {
    const id = parseGuildId(input)
    if (!id) return null
    const value = Number(id)
    return Number.isSafeInteger(value) ? value : null
}

/** UNIX 秒级时间戳转本地时间字符串。 */
export function formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString()
}
