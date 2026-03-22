import { Client } from '../Classes/client';
import * as _ from 'radashi';
import { store } from '../Store';

export class CleanUpManager {
  private interval: NodeJS.Timeout | null = null;

  constructor(private client: Client) { }

  start() {
    const options = this.client.options.autoCleanUp;
    if (!options?.enabled) return;

    this.interval = setInterval(() => {
      this.run();
    }, options.intervalMs);

    this.run();
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async run() {
    const options = this.client.options.autoCleanUp;
    if (!options?.enabled) return;

    const threshold = Date.now() - options.maxAgeMs;

    for (const scope of options.scopes) {
      try {
        const db = this.client.db(scope);
        const keys = await db.keys();
        
        const oldIds: string[] = [];

        for (const key of keys) {
          const value: any = await db.get(key);
          if (value && value.timestamp !== undefined && value.timestamp < threshold) {
            oldIds.push(key);
          }
        }

        if (oldIds.length > 0) {
          for (const chunk of _.cluster(oldIds, 500)) {
            await Promise.all(chunk.map((id: string) => db.del(id)));
          }

          store.spinner.info(`[CleanUpManager] Cleaned up ${oldIds.length} items from ${scope}`);
        }
      } catch (err) {
        // Silently fail or log if needed
      }
    }
  }
}
