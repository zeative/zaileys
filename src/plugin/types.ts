import type { Client } from '../client/client.js'
import type { Logger, ClientEventMap } from '../client/types.js'
import type {
  CommandGuards,
  CommandHandler,
  CommandMeta,
  CommandSpec,
  Middleware,
} from '../command/index.js'
import type { InboundEventMap } from '../events/types.js'

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

/** `'poll-vote'` reads as `pollVote()` on a plugin, so the method names stay idiomatic. */
type Camel<S extends string> = S extends `${infer Head}-${infer Tail}`
  ? `${Head}${Capitalize<Camel<Tail>>}`
  : S

/** One optional method per inbound event, derived so a new event is available here automatically. */
export type PluginEventHandlers = {
  [E in keyof InboundEventMap as Camel<E>]?: (
    payload: InboundEventMap[E],
    ctx: PluginContext,
  ) => void | Promise<void>
}

/** Every inbound event name, in the order their methods are wired up. */
export const INBOUND_EVENTS = [
  'message',
  'text',
  'image',
  'video',
  'audio',
  'document',
  'sticker',
  'reaction',
  'edit',
  'delete',
  'poll-vote',
  'button-click',
  'list-select',
  'mention',
  'mention-all',
  'group-update',
  'group-join',
  'group-leave',
  'member-tag',
  'call-incoming',
  'call-ended',
  'history-sync',
  'limited',
  'presence',
  'newsletter',
] as const satisfies ReadonlyArray<keyof InboundEventMap>

export type Plugin = CommandMeta &
  CommandGuards &
  PluginEventHandlers & {
    /** Identifies the plugin, and names the command that `command()` handles. */
    name: string
    aliases?: string[]
    /** Handles the command named after this plugin. The metadata above describes it. */
    command?: (ctx: Parameters<CommandHandler>[0], plugin: PluginContext) => void | Promise<void>
    /** Escape hatch for what the methods above cannot express: extra commands, middleware, cleanup. */
    setup?(ctx: PluginContext): void | (() => void) | Promise<void | (() => void)>
    onUnload?(): void | Promise<void>
  }

export type PluginsOptions = {
  dir?: string
  watch?: boolean
  pattern?: RegExp
  ignore?: RegExp
  onError?: (err: unknown, file: string) => void
}

/** Identity helper — gives you autocomplete on the plugin shape at zero runtime cost. */
export const definePlugin = (plugin: Plugin): Plugin => plugin
