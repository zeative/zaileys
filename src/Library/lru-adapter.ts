import { LRUCache } from 'lru-cache';
import { CacheStore } from 'baileys';

export class LRUCacheAdapter implements CacheStore {
  constructor(private cache: LRUCache<string, any>) {}

  get<T>(key: string): T | undefined {
    return this.cache.get(key) as T | undefined;
  }

  set<T>(key: string, value: T): void {
    this.cache.set(key, value);
  }

  del(key: string): void {
    this.cache.delete(key);
  }

  flushAll(): void {
    this.cache.clear();
  }
}
