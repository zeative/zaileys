import { createSpinner } from 'nanospinner';
import { LRUCache } from 'lru-cache';
import pino from 'pino';
import { EventEmitter } from 'node:events';
import { centerStoreCache } from '../Config/cache';
import { ClassProxy } from './class-proxy';

export interface CenterStore extends LRUCache<string, any> {}
  
export class CenterStore extends LRUCache<string, any> {
  constructor() {
    super({ max: 1000, ttl: 60 * 10 * 1000 });
    return new ClassProxy().classInjection(this, [centerStoreCache]);
  }

  spinner = createSpinner('', { color: 'green' });

  logger = pino({ level: 'silent', enabled: false });

  events = new EventEmitter();
}

export const store = new CenterStore();
