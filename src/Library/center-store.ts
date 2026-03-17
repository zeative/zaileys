import { LRUCache } from 'lru-cache';
import { createSpinner } from 'nanospinner';
import { EventEmitter } from 'node:events';
import pino from 'pino';
import { centerStoreCache } from '../Config/cache';
import { classInjection } from './class-proxy';

export interface CenterStore extends LRUCache<string, any> { }

export class CenterStore extends LRUCache<string, any> {
  constructor() {
    super({ max: 1000, ttl: 60 * 10 * 1000 });
    return classInjection(this, [centerStoreCache]);
  }

  spinner = createSpinner('', { color: 'green' });

  logger = pino({ level: 'silent', enabled: false });

  events = new EventEmitter();
}

export const store = new CenterStore();
