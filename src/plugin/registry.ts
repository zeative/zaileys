import path from 'node:path'
import type { Logger } from '../client/types.js'
import type { Plugin, PluginContext } from './types.js'

export interface PluginHost {
  command(spec: string, handler: Parameters<PluginContext['command']>[1]): unknown
  unregisterCommand(spec: string): void
  use(mw: Parameters<PluginContext['use']>[0]): unknown
  unuse(mw: Parameters<PluginContext['use']>[0]): unknown
  on: PluginContext['on']
  logger?: Logger | undefined
}

type Loaded = {
  plugin: Plugin
  file: string
  disposers: Array<() => void | Promise<void>>
}

export class PluginRegistry {
  private readonly host: PluginHost
  private readonly logger: Logger | undefined
  private readonly plugins = new Map<string, Loaded>()

  constructor(deps: { client: PluginHost; logger?: Logger }) {
    this.host = deps.client
    this.logger = deps.logger ?? deps.client.logger
  }

  has(name: string): boolean {
    return this.plugins.has(name)
  }

  list(): string[] {
    return [...this.plugins.keys()]
  }

  async loadPlugin(plugin: Plugin, file: string): Promise<void> {
    if (typeof plugin?.name !== 'string' || typeof plugin?.setup !== 'function') {
      this.logger?.warn({ file }, 'plugin: invalid shape (need name + setup); skipped')
      return
    }
    if (this.plugins.has(plugin.name)) {
      this.logger?.warn({ name: plugin.name, file }, 'plugin: duplicate name; skipped')
      return
    }
    const disposers: Loaded['disposers'] = []
    const ctx: PluginContext = {
      client: this.host as never,
      logger: this.logger,
      pluginDir: path.dirname(file),
      command: (spec, handler) => {
        this.host.command(spec, handler)
        disposers.push(() => this.host.unregisterCommand(spec))
      },
      use: (mw) => {
        this.host.use(mw)
        disposers.push(() => { this.host.unuse(mw) })
      },
      on: (event, handler) => {
        const off = this.host.on(event, handler)
        disposers.push(off)
        return off
      },
      once: (event, handler) => {
        let fired = false
        const off = this.host.on(event, (payload) => {
          if (fired) return
          fired = true
          off()
          handler(payload)
        })
        disposers.push(off)
        return off
      },
    }
    try {
      const teardown = await plugin.setup(ctx)
      if (typeof teardown === 'function') disposers.push(teardown)
    } catch (err) {
      for (const d of disposers.reverse()) {
        try { await d() } catch { void 0 }
      }
      this.logger?.error({ err, name: plugin.name, file }, 'plugin: setup failed; skipped')
      return
    }
    this.plugins.set(plugin.name, { plugin, file, disposers })
  }

  async unload(name: string): Promise<void> {
    const loaded = this.plugins.get(name)
    if (!loaded) return
    this.plugins.delete(name)
    for (const dispose of [...loaded.disposers].reverse()) {
      try { await dispose() } catch (err) { this.logger?.warn({ err, name }, 'plugin: disposer threw') }
    }
    try { await loaded.plugin.onUnload?.() } catch (err) {
      this.logger?.warn({ err, name }, 'plugin: onUnload threw')
    }
  }

  async unloadAll(): Promise<void> {
    for (const name of this.list()) await this.unload(name)
  }
}
