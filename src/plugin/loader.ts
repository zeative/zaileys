import { promises as fs, watch as fsWatch, type FSWatcher } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Logger } from '../client/types.js'
import type { PluginRegistry } from './registry.js'
import type { Plugin, PluginsOptions } from './types.js'

const DEFAULT_PATTERN = /\.(ts|js|mjs|cjs)$/
const DEFAULT_IGNORE = /(\.d\.ts$|^_|[/\\]_)/

export async function scanPluginFiles(
  dir: string,
  pattern: RegExp,
  ignore: RegExp,
): Promise<string[]> {
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (ignore.test(entry.name) || ignore.test(full)) continue
    if (entry.isDirectory()) {
      out.push(...(await scanPluginFiles(full, pattern, ignore)))
    } else if (pattern.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

export async function importPlugin(file: string, bust?: number): Promise<Plugin | undefined> {
  try {
    const url = pathToFileURL(file).href + (bust !== undefined ? `?t=${bust}` : '')
    const mod = (await import(url)) as { default?: Plugin } & Partial<Plugin>
    const candidate = mod.default ?? (mod as Plugin)
    if (candidate && typeof candidate.name === 'string' && typeof candidate.setup === 'function') {
      return candidate
    }
    return undefined
  } catch {
    return undefined
  }
}

export class PluginLoader {
  private readonly dir: string
  private readonly pattern: RegExp
  private readonly ignore: RegExp
  private readonly watchEnabled: boolean
  private readonly onError: ((err: unknown, file: string) => void) | undefined
  private readonly registry: PluginRegistry
  private readonly logger: Logger | undefined
  private watcher: FSWatcher | undefined
  private readonly fileToName = new Map<string, string>()
  private bust = 0
  private debounce: ReturnType<typeof setTimeout> | undefined
  private readonly pending = new Set<string>()

  constructor(deps: {
    registry: PluginRegistry
    options: PluginsOptions
    logger?: Logger
  }) {
    this.registry = deps.registry
    this.logger = deps.logger
    this.dir = path.resolve(deps.options.dir ?? './plugins')
    this.pattern = deps.options.pattern ?? DEFAULT_PATTERN
    this.ignore = deps.options.ignore ?? DEFAULT_IGNORE
    this.watchEnabled = deps.options.watch !== false
    this.onError = deps.options.onError
  }

  async start(): Promise<void> {
    const files = await scanPluginFiles(this.dir, this.pattern, this.ignore)
    for (const file of files) await this.loadFile(file)
    if (this.watchEnabled) this.startWatch()
  }

  async stop(): Promise<void> {
    if (this.debounce) clearTimeout(this.debounce)
    this.watcher?.close()
    this.watcher = undefined
    await this.registry.unloadAll()
    this.fileToName.clear()
  }

  private async loadFile(file: string): Promise<void> {
    const plugin = await importPlugin(file, this.bust)
    if (!plugin) {
      const err = new Error(`failed to import plugin: ${file}`)
      this.onError?.(err, file)
      this.logger?.warn({ file }, 'plugin: import failed; skipped')
      return
    }
    const before = this.registry.list()
    await this.registry.loadPlugin(plugin, file)
    const added = this.registry.list().find((n) => !before.includes(n))
    if (added) this.fileToName.set(file, added)
  }

  private startWatch(): void {
    try {
      this.watcher = fsWatch(this.dir, { recursive: true }, (_evt, filename) => {
        if (filename == null) return
        const full = path.join(this.dir, filename.toString())
        if (this.ignore.test(filename.toString()) || !this.pattern.test(filename.toString())) return
        this.pending.add(full)
        if (this.debounce) clearTimeout(this.debounce)
        this.debounce = setTimeout(() => void this.flush(), 150)
        this.debounce.unref?.()
      })
    } catch (err) {
      this.logger?.warn({ err, dir: this.dir }, 'plugin: watch unavailable; hot-reload disabled')
    }
  }

  private async flush(): Promise<void> {
    const files = [...this.pending]
    this.pending.clear()
    this.bust += 1
    for (const file of files) {
      const existing = this.fileToName.get(file)
      if (existing) {
        await this.registry.unload(existing)
        this.fileToName.delete(file)
      }
      let stillExists = true
      try { await fs.access(file) } catch { stillExists = false }
      if (stillExists) await this.loadFile(file)
    }
  }
}
