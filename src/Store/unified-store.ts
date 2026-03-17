import { LRUCache } from 'lru-cache';
import { Mutex } from 'async-mutex';
import { createSpinner } from 'nanospinner';
import pino from 'pino';
import { EventEmitter } from 'node:events';

interface NamespaceOptions {
  max?: number;
  ttl?: number;
}

export class NamespacedStore {
  private cache: LRUCache<string, unknown>;
  private mutex = new Mutex();
  readonly namespace: string;

  constructor(namespace: string, options?: NamespaceOptions) {
    this.namespace = namespace;
    this.cache = new LRUCache({
      max: options?.max ?? 500,
      ttl: options?.ttl,
    });
  }

  private key(k: string): string {
    return `${this.namespace}:${k}`;
  }

  set<T>(key: string, value: T): void {
    this.cache.set(this.key(key), value);
  }

  get<T>(key: string): T | undefined {
    return this.cache.get(this.key(key)) as T | undefined;
  }

  has(key: string): boolean {
    return this.cache.has(this.key(key));
  }

  delete(key: string): boolean {
    return this.cache.delete(this.key(key));
  }

  getOrSet<T>(key: string, factory: () => T): T {
    if (this.has(key)) return this.get<T>(key)!;
    const value = factory();
    this.set(key, value);
    return value;
  }

  async getOrCreate<T>(key: string, factory: () => Promise<T>): Promise<T> {
    if (this.has(key)) return this.get<T>(key)!;

    const release = await this.mutex.acquire();
    try {
      if (this.has(key)) return this.get<T>(key)!;

      const value = await factory();
      this.set(key, value);
      return value;
    } finally {
      release();
    }
  }

  clear(): void {
    this.cache.clear();
  }

  keys(): string[] {
    return Array.from(this.cache.keys())
      .filter((k) => k.startsWith(`${this.namespace}:`))
      .map((k) => k.slice(this.namespace.length + 1));
  }

  getAll(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const k of this.keys()) {
      result[k] = this.get(k);
    }
    return result;
  }

  get size(): number {
    return this.keys().length;
  }
}

class UnifiedStore {
  private namespaces = new Map<string, NamespacedStore>();

  spinner = createSpinner('', { color: 'green' });
  logger = pino({ level: 'silent', enabled: false });
  events = new EventEmitter();

  ns(name: string, options?: NamespaceOptions): NamespacedStore {
    if (!this.namespaces.has(name)) {
      this.namespaces.set(name, new NamespacedStore(name, options));
    }
    return this.namespaces.get(name)!;
  }

  drop(name: string): boolean {
    const ns = this.namespaces.get(name);
    if (!ns) return false;
    ns.clear();
    this.namespaces.delete(name);
    return true;
  }

  snapshot(): Record<string, Record<string, unknown>> {
    const result: Record<string, Record<string, unknown>> = {};
    for (const [name, ns] of this.namespaces) {
      result[name] = ns.getAll();
    }
    return result;
  }

  get namespaceNames(): string[] {
    return Array.from(this.namespaces.keys());
  }
}

export const store = new UnifiedStore();
