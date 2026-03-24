import Datastore from '@seald-io/nedb';
import { Mutex } from 'async-mutex';
import { IStoreAdapter } from '../Types/store';

export class NeDBAdapter implements IStoreAdapter {
  private readonly db: Datastore;
  private readonly mutex = new Mutex();
  private readonly encoder?: { encode: (val: any) => string, decode: (val: string) => any };

  constructor(path: string, options?: any) {
    this.encoder = options?.encoder;
    this.db = new Datastore({
      filename: path,
      autoload: true,
      corruptAlertThreshold: 0.2,
      ...options
    });
  }

  private decode(value: any) {
    if (!this.encoder || value === undefined || value === null) return value;
    if (typeof value === 'string') return this.encoder.decode(value);
    try {
      return this.encoder.decode(JSON.stringify(value));
    } catch {
      return value;
    }
  }

  private encode(value: any) {
    if (!this.encoder || value === undefined || value === null) return value;
    return this.encoder.encode(value);
  }

  async get<T>(key: string): Promise<T | undefined> {
    const doc = await this.db.findOneAsync({ _id: key });
    return doc ? this.decode((doc as any).value) : undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    const encoded = this.encode(value);
    await this.mutex.runExclusive(async () => {
      await this.db.updateAsync(
        { _id: key },
        { _id: key, value: encoded },
        { upsert: true }
      );
    });
  }

  async del(key: string): Promise<void> {
    await this.mutex.runExclusive(async () => {
      await this.db.removeAsync({ _id: key }, {});
    });
  }

  async clear(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      await this.db.removeAsync({}, { multi: true });
    });
  }

  async keys(prefix?: string): Promise<string[]> {
    const query = prefix
      ? { _id: new RegExp('^' + this.escapeRegExp(prefix)) }
      : {};
    const docs = await this.db.findAsync(query);
    return docs.map(doc => (doc as any)._id);
  }

  async getMany<T>(keys: string[]): Promise<Record<string, T>> {
    const docs = await this.db.findAsync({ _id: { $in: keys } });
    const result: Record<string, T> = {};
    for (const doc of docs) {
      result[(doc as any)._id] = this.decode((doc as any).value);
    }
    return result;
  }

  async setMany<T>(data: Record<string, T>): Promise<void> {
    const entries = Object.entries(data);
    await this.mutex.runExclusive(async () => {
      await Promise.all(
        entries.map(([key, value]) =>
          this.db.updateAsync(
            { _id: key },
            { _id: key, value: this.encode(value) },
            { upsert: true }
          )
        )
      );
    });
  }

  async compact(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      await this.db.compactDatafileAsync();
    });
  }

  async close(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      // No-op, just wait for current tasks to finish
    });
  }

  private escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
