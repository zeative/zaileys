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
};

type FileInfo = {
  filePath: string;
  parent: string | null;
};

export class Plugins {
  private plugins: PluginDefinition[] = [];
  private pluginsDir: string;

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
            return { ...plugin, parent };
          }
        } catch {}
        return null;
      })
    );

    this.plugins = loadResults.filter((p): p is PluginDefinition => p !== null);
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

  private match(text: string, matchers: (string | RegExp)[]): boolean {
    return matchers.some((matcher) => {
      if (matcher instanceof RegExp) {
        return matcher.test(text);
      }
      return text === matcher || text.startsWith(matcher + ' ');
    });
  }

  getLoadedPlugins(): PluginDefinition[] {
    return this.plugins;
  }

  getPluginsInfo(): { 
    matcher: (string | RegExp)[]; 
    metadata?: Record<string, any>; 
    parent: string | null;
  }[] {
    return this.plugins.map((p) => ({
      matcher: p.config.matcher,
      metadata: p.config.metadata,
      parent: p.parent,
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
): Omit<PluginDefinition, 'parent'> => {
  return {
    handler,
    config,
  };
};