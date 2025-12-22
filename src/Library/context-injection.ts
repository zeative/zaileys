import { Mutex } from 'async-mutex';
import { injectionCache } from '../Config/cache';

class ContextInjectionStore {
  private store = injectionCache;
  private mutex = new Mutex();

  async inject<T>(key: string, value: T): Promise<void> {
    const release = await this.mutex.acquire();

    try {
      this.store.set(key, value);
    } finally {
      release();
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    const release = await this.mutex.acquire();

    try {
      return this.store.get(key) as T | undefined;
    } finally {
      release();
    }
  }

  getSync<T>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  getAll(): Record<string, any> {
    const keys = this.store.keys();
    return this.store.mget(keys);
  }

  async remove(key: string): Promise<boolean> {
    const release = await this.mutex.acquire();

    try {
      return this.store.del(key) > 0;
    } finally {
      release();
    }
  }

  async clear(): Promise<void> {
    const release = await this.mutex.acquire();

    try {
      this.store.flushAll();
    } finally {
      release();
    }
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  get size(): number {
    return this.store.getStats().keys;
  }

  keys(): string[] {
    return this.store.keys();
  }
}

export const contextInjection = new ContextInjectionStore();
