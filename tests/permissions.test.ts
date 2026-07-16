import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Session } from 'koishi'
import type { Config } from '../src/config'
import {
    getAdminCommandPermissionError,
    isDeputyAdmin,
    isPrimaryAdmin,
} from '../src/utils'

function createConfig(overrides: Partial<Config> = {}): Config {
    return {
        admin: {
            primaryAdmins: ['10001'],
            deputyAdmins: ['onebot:10002'],
            notificationGroupId: 'onebot:20001',
        },
        permission: {
            mode: 'builtin',
            koishiAuthority: 3,
            protectedCommands: [],
        },
        ...overrides,
    } as Config
}

function createSession(userId: string, guildId?: string, authority?: number): Session {
    return {
        userId,
        guildId,
        user: authority == null ? undefined : { authority },
    } as Session
}

describe('gc 管理员权限', () => {
    it('统一识别纯数字和带平台前缀的管理员 ID', () => {
        const config = createConfig()
        assert.equal(isPrimaryAdmin(createSession('onebot:10001'), config), true)
        assert.equal(isDeputyAdmin(createSession('10002'), config), true)
    })

    it('配置通知群后仅允许副管理员在通知群使用 gc 指令', () => {
        const config = createConfig()
        const expected = '已配置审核通知群，请到审核群中处理该请求。'

        assert.equal(getAdminCommandPermissionError(createSession('10002'), config), expected)
        assert.equal(getAdminCommandPermissionError(createSession('10002', '20002'), config), expected)
        assert.equal(getAdminCommandPermissionError(createSession('10002', 'onebot:20001'), config), null)
    })

    it('主管理员不受通知群位置限制', () => {
        const config = createConfig()
        assert.equal(getAdminCommandPermissionError(createSession('onebot:10001'), config), null)
        assert.equal(getAdminCommandPermissionError(createSession('10001', '20002'), config), null)
    })

    it('未配置通知群时允许副管理员在私聊使用 gc 指令', () => {
        const config = createConfig({
            admin: {
                primaryAdmins: ['10001'],
                deputyAdmins: ['10002'],
                notificationGroupId: '',
            },
        })
        assert.equal(getAdminCommandPermissionError(createSession('10002'), config), null)
    })

    it('Koishi authority 模式不区分主副管理员和会话位置', () => {
        const config = createConfig({
            permission: {
                mode: 'koishi',
                koishiAuthority: 3,
                protectedCommands: [],
            },
        })
        assert.equal(getAdminCommandPermissionError(createSession('30001', undefined, 3), config), null)
        assert.equal(getAdminCommandPermissionError(createSession('30001', '20002', 2), config), '权限不足。')
    })
})
