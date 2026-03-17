import { Client } from '../Classes';
import { rateStore } from '../Store';

export class RateLimiter {
  private maxMessages: number;

  constructor(private client: Client) {
    this.maxMessages = this.client.options.limiter?.maxMessages || 20;
    // Note: TTL is now handled by the rateStore namespace configuration globally.
  }

  async isSpam(key: string): Promise<boolean> {
    const current = rateStore.get<number>(key) || 0;

    if (current >= this.maxMessages) {
      return true;
    }

    rateStore.set(key, current + 1);
    return false;
  }
}

