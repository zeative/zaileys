import type { Client } from '../client/client.js'
import type { Logger, ClientEventMap } from '../client/types.js'
import type { CommandHandler, CommandSpec, Middleware } from '../command/index.js'

export interface PluginContext {
  client: Client
  logger: Logger | undefined
  pluginDir: string
  /** The subfolder this plugin lives in. Commands default their `category` to it. */
  category: string | undefined
  command(spec: string | CommandSpec, handler: CommandHandler): void
  use(middleware: Middleware): void
  on<E extends keyof ClientEventMap>(
    event: E,
    handler: (payload: ClientEventMap[E]) => void,
  ): () => void
  once<E extends keyof ClientEventMap>(
    event: E,
    handler: (payload: ClientEventMap[E]) => void,
  ): () => void
}

export interface Plugin {
  name: string
  setup(ctx: PluginContext): void | (() => void) | Promise<void | (() => void)>
  onUnload?(): void | Promise<void>
}

export type PluginsOptions = {
  dir?: string
  watch?: boolean
  pattern?: RegExp
  ignore?: RegExp
  onError?: (err: unknown, file: string) => void
}

export const definePlugin = (plugin: Plugin): Plugin => plugin
