import NodeCache from 'node-cache';

export const centerStoreCache = new NodeCache({
  stdTTL: 60 * 10, // 10 minutes
  checkperiod: 60 * 2, // 2 minutes
  useClones: false,
});

export const groupCache = new NodeCache({
  stdTTL: 60 * 5, // 5 minutes
  useClones: false,
});

export const mediaCache = new NodeCache({
  stdTTL: 60 * 5, // 5 minute
});

export const injectionCache = new NodeCache({
  stdTTL: 60 * 10, // 10 minutes
  checkperiod: 60 * 2, // 2 minutes
  useClones: false,
  deleteOnExpire: true,
  maxKeys: 100,
});

export const msgRetryCache = new NodeCache();
