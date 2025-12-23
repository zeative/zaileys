import { createSpinner } from 'nanospinner';
import NodeCache from 'node-cache';
import pino from 'pino';
import { EventEmitter } from 'node:events';
import { centerStoreCache } from '../Config/cache';
import { ClassProxy } from './class-proxy';

export interface CenterStore extends NodeCache {}
  
export class CenterStore extends NodeCache {
  constructor() {
    super({ useClones: false });
    return new ClassProxy().classInjection(this, [centerStoreCache]);
  }

  spinner = createSpinner('', { color: 'green' });

  logger = pino({ level: 'silent', enabled: false });

  events = new EventEmitter();
}

export const store = new CenterStore();
