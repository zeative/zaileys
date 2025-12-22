import { Mutex } from 'async-mutex';

class ContextInjectionStore {
  private store = new Map<string, any>();
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
    const result: Record<string, any> = {};
    for (const [key, value] of this.store.entries()) {
      result[key] = value;
    }
    return result;
  }

  async remove(key: string): Promise<boolean> {
    const release = await this.mutex.acquire();
    try {
      return this.store.delete(key);
    } finally {
      release();
    }
  }

  async clear(): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      this.store.clear();
    } finally {
      release();
    }
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  get size(): number {
    return this.store.size;
  }

  keys(): string[] {
    return Array.from(this.store.keys());
  }
}

export const contextInjection = new ContextInjectionStore();
