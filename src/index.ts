import { Context, h } from 'koishi'
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

// 配置页顶部备注（支持 markdown）
export const usage = [
  '本插件的功能比较复杂，建议先查看 [readme](https://github.com/muyni233/koishi-plugin-group-control) 再使用哦',
  '如果有任何意见或 bug，欢迎提交 [issue](https://github.com/muyni233/koishi-plugin-group-control/issues) ~',
].join('\n\n')


export function apply(ctx: Context, config: Config) {
  ctx.on('dispose', () => {
    clearGuildAdminCache()
  })

  // koishi help 插件在指令详情标题里直接拼接未转义的 command.declaration（形如 ` <groupId>`），
  // OneBot 适配器会把 `<groupId>` 当作消息元素标签吞掉，导致用法提示里参数不可见。
  // 这里转义标题中的尖括号片段。
  ctx.on('help/command', (output, command) => {
    const title = output[0]
    if (typeof title === 'string' && command.declaration) {
      output[0] = title.replace(/<[^<>]*>/g, (m) => h.escape(m))
    }
  })

  ctx.plugin(database)
  ctx.plugin(basic, config)
  ctx.plugin(invite, config)
  ctx.plugin(frequency, config)
  ctx.plugin(commands, config)
  ctx.plugin(botSwitch, config)
  ctx.plugin(friend, config)
}
