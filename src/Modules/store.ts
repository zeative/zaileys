import { createSpinner } from 'nanospinner';
import NodeCache from 'node-cache';
import { EventEmitter } from 'node:events';
import pino from 'pino';
import { createJetDB, JetDB } from 'jetdb';

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

  db(session: string, dir: string): JetDB {
    const path = `.session/${session}/store/${dir}.json`;
    const db = createJetDB(path, {
      cacheSize: 5000,
      flushMode: 'debounce',
      debounceMs: 300,
      compression: 'deflate',
      serialization: 'json',
      enableIndexing: true,
      hotThreshold: 5,
    });

    return db;
  }

  spinner = createSpinner('', { color: 'green' });

  logger = pino({ level: 'silent', enabled: false });

  events = new EventEmitter();
  groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });
  collectors = new Map<string, any>();
}

export const store = new NanoStore();
