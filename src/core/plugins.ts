import { Zaileys } from './zaileys'

export type PluginFunc = (bot: Zaileys) => void

/**
 * Define a Zaileys plugin.
 */
export function definePlugin(fn: PluginFunc): PluginFunc {
  return fn
}

/**
 * Example plugin logic (Skeleton).
 */
export const loggerPlugin = definePlugin((bot) => {
  bot.on('message', (m) => {
    console.log('[ZA] New message received')
  })
})
