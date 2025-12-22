import { promises as fs } from 'fs';
import { join, relative, sep } from 'path';
import { pathToFileURL } from 'url';
import type { MiddlewareContextType } from '../Types/middleware';
import type { Client } from './client';

export type PluginsHandlerType = (
  wa: Client,
  ctx: MiddlewareContextType
) => Promise<void> | void;

export type PluginsConfigType = {
  matcher: (string | RegExp)[];
  metadata?: Record<string, any>;
};

export type PluginDefinition = {
  handler: PluginsHandlerType;
  config: PluginsConfigType;
  parent: string | null;
};

export type PluginInfo = {
  matcher: (string | RegExp)[];
  metadata?: Record<string, any>;
  parent: string | null;
};

export class Plugins {
  private plugins: PluginDefinition[] = [];

  constructor(private readonly dir = join(process.cwd(), 'plugins')) {}

  async load(): Promise<void> {
    const entries = await fs
      .readdir(this.dir, { withFileTypes: true, recursive: true })
      .catch(() => []);

    const files = entries
      .filter((e) => e.isFile() && /(?<!\.d)\.[jt]s$/.test(e.name))
      .map((e) => ({ fullPath: join(e.parentPath, e.name), parentPath: e.parentPath }))

    const loaded = await Promise.all(
      files.map(async ({ fullPath, parentPath }) => {
        try {
          const { mtimeMs } = await fs.stat(fullPath);
          const url = `${pathToFileURL(fullPath).href}?v=${Math.floor(mtimeMs)}`;
          const mod = await import(url);
          const plugin = mod.default?.default ?? mod.default;

          if (plugin?.handler && plugin?.config) {
            const rel = relative(this.dir, parentPath);
            return {
              handler: plugin.handler,
              config: plugin.config,
              parent: rel ? rel.split(sep)[0] : null,
            } as PluginDefinition;
          }
        } catch {}
        return null;
      })
    );

    this.plugins = loaded.filter((p): p is PluginDefinition => p !== null);
  }

  async execute(wa: Client, ctx: MiddlewareContextType): Promise<void> {
    const text = ctx.messages.text ?? '';

    for (const { handler, config } of this.plugins) {
      try {
        if (this.matches(text, config.matcher)) {
          await handler(wa, ctx);
        }
      } catch {}
    }
  }

  private matches(text: string, matchers: (string | RegExp)[]): boolean {
    return matchers.some((matcher) =>
      matcher instanceof RegExp
        ? matcher.test(text)
        : text === matcher || text.startsWith(matcher + ' ')
    );
  }

  getLoadedPlugins(): PluginDefinition[] {
    return this.plugins;
  }

  getPluginsInfo(): PluginInfo[] {
    return this.plugins.map(({ config: { matcher, metadata }, parent }) => ({
      matcher,
      metadata,
      parent,
    }));
  }

  reload(): Promise<void> {
    return this.load();
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