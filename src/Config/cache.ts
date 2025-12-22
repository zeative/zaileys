import NodeCache from 'node-cache';

export const centerStoreCache = new NodeCache({
  stdTTL: 600, // 10 minutes
  checkperiod: 120, // 2 minutes
  useClones: false,
});

export const groupCache = new NodeCache({
  stdTTL: 5 * 60, // 5 minutes
  useClones: false,
});

export const mediaCache = new NodeCache({
  stdTTL: 300, // 5 minute
});

export const msgRetryCache = new NodeCache();
