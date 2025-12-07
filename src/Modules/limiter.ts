import { RateLimiterMemory } from 'rate-limiter-flexible';
import { Client } from '../Classes';

export class RateLimiter {
  private limiter: RateLimiterMemory;

  constructor(private client: Client) {
    this.limiter = new RateLimiterMemory({
      points: this.client.options.limiter?.maxMessages,
      duration: this.client.options.limiter?.durationMs / 1000,
    });
  }

  async isSpam(key: string) {
    try {
      await this.limiter.consume(key);
      return false;
    } catch {
      return true;
    }
  }
}
