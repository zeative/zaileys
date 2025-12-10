import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { MiddlewareContextType } from '../Types/middleware';
import { Client } from './client';

export type PluginsHandlerType = (wa: Client, ctx: MiddlewareContextType) => Promise<void> | void;
export type PluginsConfigType = {
  matcher: string[];
  metadata?: Record<string, any>;
};

export type PluginDefinition = {
  handler: PluginsHandlerType;
  config: PluginsConfigType;
};

export class Plugins {
  private plugins: PluginDefinition[] = [];
  private pluginsDir: string;

  constructor(pluginsDir: string = path.join(process.cwd(), 'plugins')) {
    this.pluginsDir = pluginsDir;
  }

  /**
   * Rekursif membaca semua file di direktori dan subdirektori
   */
  private getAllFiles(dir: string, fileList: string[] = []): string[] {
    if (!fs.existsSync(dir)) return fileList;

    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        this.getAllFiles(filePath, fileList);
      } else if ((file.endsWith('.ts') || file.endsWith('.js')) && !file.endsWith('.d.ts')) {
        fileList.push(filePath);
      }
    }

    return fileList;
  }

  async load(): Promise<void> {
    if (!fs.existsSync(this.pluginsDir)) return;

    const files = this.getAllFiles(this.pluginsDir);

    for (const filePath of files) {
      try {
        const pluginModule = await import(pathToFileURL(filePath).href);
        let plugin = pluginModule.default;

        if (plugin?.default) {
          plugin = plugin.default;
        }

        if (plugin?.handler && plugin?.config) {
          this.plugins.push(plugin);
        }
      } catch {}
    }
  }

  async execute(wa: Client, ctx: MiddlewareContextType): Promise<void> {
    const messageText = ctx.messages.text || '';

    for (const plugin of this.plugins) {
      try {
        const isMatch = this.match(messageText, plugin.config.matcher);

        if (isMatch) {
          await plugin.handler(wa, ctx);
        }
      } catch {}
    }
  }

  private match(text: string, matchers: string[]): boolean {
    return matchers.some((m) => text === m || text.startsWith(m + ' '));
  }

  getLoadedPlugins(): PluginDefinition[] {
    return this.plugins;
  }

  getPluginsInfo(): { matcher: string[]; metadata?: Record<string, any> }[] {
    return this.plugins.map((p) => ({ matcher: p.config.matcher, metadata: p.config.metadata }));
  }

  async reload(): Promise<void> {
    this.plugins = [];
    await this.load();
  }
}

export const definePlugins = (handler: PluginsHandlerType, config: PluginsConfigType): PluginDefinition => {
  return {
    handler,
    config,
  };
};
