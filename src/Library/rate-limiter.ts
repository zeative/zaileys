import { LRUCache } from 'lru-cache';
import { Client } from '../Classes';

export class RateLimiter {
  private limiter: LRUCache<string, number>;
  private maxMessages: number;

  constructor(private client: Client) {
    this.maxMessages = this.client.options.limiter?.maxMessages || 20;
    const ttl = this.client.options.limiter?.durationMs || 10000;

    this.limiter = new LRUCache<string, number>({
      max: 5000,
      ttl,
      noUpdateTTL: true,
    });
  }

  async isSpam(key: string): Promise<boolean> {
    const current = this.limiter.get(key) || 0;

    if (current >= this.maxMessages) {
      return true;
    }

    this.limiter.set(key, current + 1);
    return false;
  }
}

