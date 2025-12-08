import { MiddlewareContextType } from '../Types/middleware';
import { Client } from './client';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';

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
    if (!fs.existsSync(this.pluginsDir)) return;

    const files = fs.readdirSync(this.pluginsDir).filter((f) => (f.endsWith('.ts') || f.endsWith('.js')) && !f.endsWith('.d.ts'));

    for (const file of files) {
      const filePath = path.join(this.pluginsDir, file);

      try {
        const pluginModule = await import(pathToFileURL(filePath).href);
        const plugin = pluginModule.default;

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
