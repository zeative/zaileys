import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { MiddlewareContextType } from '../Types/middleware';
import { Client } from './client';

export type PluginsHandlerType = (wa: Client, ctx: MiddlewareContextType) => Promise<void> | void;
export type PluginsConfigType = {
  matcher: (string | RegExp)[];
  metadata?: Record<string, any>;
};

export type PluginDefinition = {
  handler: PluginsHandlerType;
  config: PluginsConfigType;
  parent: string | null;
  enabled: boolean;
};

export class Plugins {
  private plugins: PluginDefinition[] = [];
  private pluginsDir: string;
  private globalEnabled = true;
  private disabledPlugins = new Set<string>();
  private hmr = false;
  private watcher: fs.FSWatcher | null = null;

  constructor(pluginsDir: string = 'plugins', hmr = false) {
    this.pluginsDir = path.isAbsolute(pluginsDir) ? pluginsDir : path.join(process.cwd(), pluginsDir);
    this.hmr = hmr;
  }

  async load(): Promise<void> {
    const entries = await fs.promises
      .readdir(this.pluginsDir, { withFileTypes: true, recursive: true })
      .catch(() => []);

    const files = entries
      .filter((entry) => entry.isFile() && /(?<!\.d)\.[jt]s$/.test(entry.name))
      .map((entry) => ({
        filePath: path.join(entry.parentPath, entry.name),
        parent: path.relative(this.pluginsDir, entry.parentPath).split(path.sep)[0] || null,
      }));

    const loadResults = await Promise.all(
      files.map(async ({ filePath, parent }): Promise<PluginDefinition | null> => {
        try {
          const { mtimeMs } = await fs.promises.stat(filePath);
          const fileUrl = `${pathToFileURL(filePath).href}?v=${Math.floor(mtimeMs)}`;

          const pluginModule = await import(fileUrl);
          let plugin = pluginModule.default;

          if (plugin?.default) {
            plugin = plugin.default;
          }

          if (plugin?.handler && plugin?.config) {
            const pluginId = this.getPluginId(plugin.config.matcher);
            return {
              ...plugin,
              parent,
              enabled: !this.disabledPlugins.has(pluginId),
            };
          }
        } catch (error) {
          console.error(`[Plugins] Failed to load plugin ${filePath}:`, error);
        }
        return null;
      }),
    );

    this.plugins = loadResults.filter((p): p is PluginDefinition => p !== null);
  }

  setupHmr(): void {
    if (!this.hmr || this.watcher) return;

    try {
      if (!fs.existsSync(this.pluginsDir)) {
        return;
      }

      this.watcher = fs.watch(this.pluginsDir, { recursive: true }, async (event, filename) => {
        if (filename && /\.[jt]s$/.test(filename)) {
          await this.reload();
        }
      });
    } catch (error) {
      console.error('[Plugins] Failed to setup HMR:', error);
    }
  }

  private getPluginId(matcher: (string | RegExp)[]): string {
    return matcher.map((m) => m.toString()).join('|');
  }

  async execute(wa: Client, ctx: MiddlewareContextType): Promise<void> {
    if (!this.globalEnabled) return;

    const messageText = ctx.messages?.text || '';

    for (const plugin of this.plugins) {
      if (!plugin.enabled) continue;

      try {
        const isMatch = this.match(messageText, plugin.config.matcher);

        if (isMatch) {
          await plugin.handler(wa, ctx);
        }
      } catch (error) {
        console.error(`[Plugins] Error executing plugin:`, error);
      }
    }
  }

  private match(text: string, matchers: (string | RegExp)[]): boolean {
    return matchers.some((matcher) => {
      if (matcher instanceof RegExp) {
        return matcher.test(text);
      }
      return text === matcher || text.startsWith(matcher + ' ');
    });
  }

  enableAll(): void {
    this.globalEnabled = true;
    this.plugins.forEach((p) => (p.enabled = true));
    this.disabledPlugins.clear();
  }

  disableAll(): void {
    this.globalEnabled = false;
  }

  enable(matcher: string | RegExp): boolean {
    const matcherStr = matcher.toString();
    const plugin = this.plugins.find((p) => p.config.matcher.some((m) => m.toString() === matcherStr));

    if (plugin) {
      plugin.enabled = true;
      this.disabledPlugins.delete(this.getPluginId(plugin.config.matcher));
      return true;
    }
    return false;
  }

  disable(matcher: string | RegExp): boolean {
    const matcherStr = matcher.toString();
    const plugin = this.plugins.find((p) => p.config.matcher.some((m) => m.toString() === matcherStr));

    if (plugin) {
      plugin.enabled = false;
      this.disabledPlugins.add(this.getPluginId(plugin.config.matcher));
      return true;
    }
    return false;
  }

  enableByParent(parent: string): number {
    let count = 0;

    this.plugins.forEach((p) => {
      if (p.parent === parent) {
        p.enabled = true;
        this.disabledPlugins.delete(this.getPluginId(p.config.matcher));
        count++;
      }
    });
    return count;
  }

  disableByParent(parent: string): number {
    let count = 0;

    this.plugins.forEach((p) => {
      if (p.parent === parent) {
        p.enabled = false;
        this.disabledPlugins.add(this.getPluginId(p.config.matcher));
        count++;
      }
    });
    return count;
  }

  isEnabled(): boolean {
    return this.globalEnabled;
  }

  getLoadedPlugins(): PluginDefinition[] {
    return this.plugins;
  }

  getPluginsInfo(): {
    matcher: (string | RegExp)[];
    metadata?: Record<string, any>;
    parent: string | null;
    enabled: boolean;
  }[] {
    return this.plugins.map((p) => ({
      matcher: p.config.matcher,
      metadata: p.config.metadata,
      parent: p.parent,
      enabled: p.enabled,
    }));
  }

  async reload(): Promise<void> {
    await this.load();
    console.log(`[Plugins] Successfully reloaded ${this.plugins.length} plugins.`);
  }

  stopHmr(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}

export const definePlugins = (handler: PluginsHandlerType, config: PluginsConfigType): Omit<PluginDefinition, 'parent' | 'enabled'> => {
  return {
    handler,
    config,
  };
};