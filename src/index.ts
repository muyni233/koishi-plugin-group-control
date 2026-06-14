import { Context } from 'koishi'
import { Config } from './config'
import * as database from './database'
import * as basic from './modules/basic'
import * as invite from './modules/invite'
import * as frequency from './modules/frequency'
import * as commands from './modules/commands'
import * as botSwitch from './modules/switch'
import * as friend from './modules/friend'
import { clearGuildAdminCache } from './utils'

export * from './config'

export const name = 'group-control'

// 插件依赖数据库服务，确保数据库就绪后再加载，规避初始化竞态
export const inject = ['database']


export function apply(ctx: Context, config: Config) {
  ctx.on('dispose', () => {
    clearGuildAdminCache()
  })

  ctx.plugin(database)
  ctx.plugin(basic, config)
  ctx.plugin(invite, config)
  ctx.plugin(frequency, config)
  ctx.plugin(commands, config)
  ctx.plugin(botSwitch, config)
  ctx.plugin(friend, config)
}
