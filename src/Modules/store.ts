import { createSpinner } from 'nanospinner';
import NodeCache from 'node-cache';
import { EventEmitter } from 'node:stream';
import pino from 'pino';
import { createLowdb, Lowdb } from './lowdb';

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

  private dbCache = new Map<string, Lowdb>();

  lowdb(session: string, dir: string): Lowdb {
    const path = `.session/${session}/${dir}`;
    if (this.dbCache.has(path)) {
      return this.dbCache.get(path)!;
    }
    const db = createLowdb(path);
    this.dbCache.set(path, db);
    return db;
  }

  spinner = createSpinner('', { color: 'green' });
  logger = pino({ level: 'silent', enabled: false });

  events = new EventEmitter();

  groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });
}

export const store = new NanoStore();
