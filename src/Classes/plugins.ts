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

type FileInfo = {
  filePath: string;
  parent: string | null;
};

export class Plugins {
  private plugins: PluginDefinition[] = [];
  private pluginsDir: string;
  private globalEnabled = true;
  private disabledPlugins = new Set<string>();

  constructor(pluginsDir: string = path.join(process.cwd(), 'plugins')) {
    this.pluginsDir = pluginsDir;
  }

  private async getAllFiles(dir: string, baseDir: string = dir): Promise<FileInfo[]> {
    try {
      await fs.promises.access(dir);
    } catch {
      return [];
    }

    const entries = await fs.promises.readdir(dir, { withFileTypes: true });

    const results = await Promise.all(
      entries.map(async (entry): Promise<FileInfo[]> => {
        const filePath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          return this.getAllFiles(filePath, baseDir);
        }

        const isValidFile =
          (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) &&
          !entry.name.endsWith('.d.ts');

        if (isValidFile) {
          const relativePath = path.relative(baseDir, dir);
          const parent = relativePath === '' 
            ? null 
            : relativePath.split(path.sep)[0];
          
          return [{ filePath, parent }];
        }

        return [];
      })
    );

    return results.flat();
  }

  async load(): Promise<void> {
    try {
      await fs.promises.access(this.pluginsDir);
    } catch {
      return;
    }

    const files = await this.getAllFiles(this.pluginsDir);

    const loadResults = await Promise.all(
      files.map(async ({ filePath, parent }): Promise<PluginDefinition | null> => {
        try {
          const pluginModule = await import(pathToFileURL(filePath).href);
          let plugin = pluginModule.default;

          if (plugin?.default) {
            plugin = plugin.default;
          }

          if (plugin?.handler && plugin?.config) {
            const pluginId = this.getPluginId(plugin.config.matcher);
            return { 
              ...plugin, 
              parent, 
              enabled: !this.disabledPlugins.has(pluginId) 
            };
          }
        } catch {}
        return null;
      })
    );

    this.plugins = loadResults.filter((p): p is PluginDefinition => p !== null);
  }

  private getPluginId(matcher: (string | RegExp)[]): string {
    return matcher.map(m => m.toString()).join('|');
  }

  async execute(wa: Client, ctx: MiddlewareContextType): Promise<void> {
    if (!this.globalEnabled) return;

    const messageText = ctx.messages.text || '';

    for (const plugin of this.plugins) {
      if (!plugin.enabled) continue;

      try {
        const isMatch = this.match(messageText, plugin.config.matcher);

        if (isMatch) {
          await plugin.handler(wa, ctx);
        }
      } catch {}
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
    this.plugins.forEach(p => p.enabled = true);
    this.disabledPlugins.clear();
  }

  disableAll(): void {
    this.globalEnabled = false;
  }

  enable(matcher: string | RegExp): boolean {
    const matcherStr = matcher.toString();
    const plugin = this.plugins.find(p => 
      p.config.matcher.some(m => m.toString() === matcherStr)
    );
    
    if (plugin) {
      plugin.enabled = true;
      this.disabledPlugins.delete(this.getPluginId(plugin.config.matcher));
      return true;
    }
    return false;
  }

  disable(matcher: string | RegExp): boolean {
    const matcherStr = matcher.toString();
    const plugin = this.plugins.find(p => 
      p.config.matcher.some(m => m.toString() === matcherStr)
    );
    
    if (plugin) {
      plugin.enabled = false;
      this.disabledPlugins.add(this.getPluginId(plugin.config.matcher));
      return true;
    }
    return false;
  }

  enableByParent(parent: string): number {
    let count = 0;
    this.plugins.forEach(p => {
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
    this.plugins.forEach(p => {
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
    this.plugins = [];
    await this.load();
  }
}

export const definePlugins = (
  handler: PluginsHandlerType,
  config: PluginsConfigType
): Omit<PluginDefinition, 'parent' | 'enabled'> => {
  return {
    handler,
    config,
  };
};