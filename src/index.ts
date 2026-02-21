import { Context } from 'koishi'
import { Config } from './config'
import * as database from './database'
import * as basic from './modules/basic'
import * as invite from './modules/invite'
import * as frequency from './modules/frequency'
import * as commands from './modules/commands'
import * as botSwitch from './modules/switch'

export * from './config'

export const name = 'group-control'

export function apply(ctx: Context, config: Config) {
  ctx.plugin(database)
  ctx.plugin(basic, config)
  ctx.plugin(invite, config)
  ctx.plugin(frequency, config)
  ctx.plugin(commands, config)
  ctx.plugin(botSwitch, config)
}