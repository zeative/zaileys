import { CacheStore } from 'baileys';
import { NamespacedStore } from '../Store/unified-store';

export class LRUCacheAdapter implements CacheStore {
  constructor(private cache: NamespacedStore) {}

  get<T>(key: string): T | undefined {
    return this.cache.get<T>(key);
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
