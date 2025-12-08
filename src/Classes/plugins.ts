import { MiddlewareContextType } from '../Types/middleware';
import { Client } from './client';
import * as fs from 'fs';
import * as path from 'path';

export type PluginsHandlerType = (wa: Client, ctx: MiddlewareContextType) => Promise<void> | void;
export type PluginsConfigType = {
  matcher: string | RegExp | ((text: string) => boolean);
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

  async load(): Promise<void> {
    try {
      if (!fs.existsSync(this.pluginsDir)) {
        console.warn(`Folder plugins tidak ditemukan: ${this.pluginsDir}`);
        return;
      }

      const files = fs.readdirSync(this.pluginsDir);

      for (const file of files) {
        if (!file.endsWith('.ts') && !file.endsWith('.js')) {
          continue;
        }

        if (file.endsWith('.d.ts')) {
          continue;
        }

        const filePath = path.join(this.pluginsDir, file);

        try {
          const pluginModule = await import(filePath);
          const plugin = pluginModule.default;

          if (plugin && plugin.handler && plugin.config) {
            this.plugins.push(plugin);
          }
        } catch {}
      }
    } catch {}
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

  private match(text: string, matcher: string | RegExp | ((text: string) => boolean)): boolean {
    if (typeof matcher === 'string') {
      return text === matcher || text.startsWith(matcher + ' ');
    } else if (matcher instanceof RegExp) {
      return matcher.test(text);
    } else if (typeof matcher === 'function') {
      return matcher(text);
    }
    return false;
  }

  getLoadedPlugins(): PluginDefinition[] {
    return this.plugins;
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
