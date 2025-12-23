import { Client } from '../Classes/client';
import { store } from './center-store';

export class CleanUpManager {
  private interval: NodeJS.Timeout | null = null;

  constructor(private client: Client) {}

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

        const oldItems = await db.query(scope).where('timestamp', '<', threshold).get();

        if (oldItems.length > 0) {
          const ids = oldItems.map((item: any) => item.key?.id || item.id);
          await db.batchDelete(ids);

          store.spinner.info(` [CleanUpManager] Cleaned up ${oldItems.length} items from ${scope}`);
        }
      } catch {}
    }
  }
}
