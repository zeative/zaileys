import { LRUCache } from 'lru-cache';

export const centerStoreCache = new LRUCache<string, any>({
  max: 1000,
  ttl: 60 * 10 * 1000, // 10 minutes
});

export const groupCache = new LRUCache<string, any>({
  max: 500,
  ttl: 60 * 5 * 1000, // 5 minutes
});

export const mediaCache = new LRUCache<string, any>({
  max: 200,
  ttl: 60 * 5 * 1000, // 5 minutes
});

export const injectionCache = new LRUCache<string, any>({
  max: 100,
  ttl: 60 * 10 * 1000, // 10 minutes
});

export const msgRetryCache = new LRUCache<string, any>({
  max: 1000
});
