import { store } from './unified-store';

export const contextStore = store.ns('context', { max: 500, ttl: 1000 * 60 * 10 });
export const cacheStore   = store.ns('cache',   { max: 2000, ttl: 1000 * 60 * 5 });
export const centerStore  = store.ns('center',  { max: 500, ttl: 1000 * 60 * 10 });
export const rateStore    = store.ns('rate',    { max: 5000, ttl: 1000 * 10 });
export const groupStore   = store.ns('group',   { max: 500, ttl: 1000 * 60 * 5 });
export const msgStore     = store.ns('msg',     { max: 1000 });

// Re-export store utama untuk global snapshot / events / loggers / spinners
export { store };
