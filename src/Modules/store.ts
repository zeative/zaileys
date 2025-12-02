import { createSpinner } from 'nanospinner';
import { EventEmitter } from 'node:stream';
import pino from 'pino';

export type StoreData = Record<string, any>;

export class NanoStore {
  private data = new Map<string, StoreData>();

  set(key: string, value: any) {
    this.data.set(key, { ...this.data.get(key), ...value });
  }

  get(key: string) {
    return this.data.get(key) || {};
  }

  update(key: string, updater: (current: StoreData) => any) {
    const current = this.get(key);
    this.set(key, updater(current));
  }

  delete(key: string) {
    this.data.delete(key);
  }

  has(key: string) {
    return this.data.has(key);
  }

  spinner = createSpinner('', { color: 'green' });
  logger = pino({ level: 'silent', enabled: false });
  events = new EventEmitter();
}

export const store = new NanoStore();
