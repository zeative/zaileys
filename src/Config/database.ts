import { BufferJSON } from 'baileys';
import { createStoreAdapter, IStoreAdapter } from '@zaileys/store-adapters';

const encoder = {
  encode: (obj: any) => JSON.stringify(obj, BufferJSON.replacer),
  decode: (str: string) => JSON.parse(str, BufferJSON.reviver),
};

const _dbCache = new Map<string, IStoreAdapter>();

const getAdapterType = (): 'lmdb' | 'json' => {
  // 1. Force JSON if on Android/Termux
  const isAndroid = process.platform === 'android' || process.env.TERMUX_VERSION;
  if (isAndroid) return 'json';

  // 2. Check if LMDB is functional
  try {
    require.resolve('lmdb');
    return 'lmdb';
  } catch {
    return 'json';
  }
};

const getOrOpenDB = (path: string, options: any): IStoreAdapter => {
  if (!_dbCache.has(path)) {
    const type = getAdapterType();
    try {
      _dbCache.set(path, createStoreAdapter(type, path, options));
    } catch (err) {
      if (type === 'lmdb') {
        console.warn(`[Zaileys] LMDB failed to initialize at ${path}, falling back to JSON:`, err instanceof Error ? err.message : err);
        _dbCache.set(path, createStoreAdapter('json', path, options));
      } else {
        throw err;
      }
    }
  }
  return _dbCache.get(path)!;
};

export const CredsDatabase = (session: string) =>
  getOrOpenDB(`.session/${session}/auth/creds`, {
    compression: false,
    encoder,
  });

export const KeysDatabase = (session: string) =>
  getOrOpenDB(`.session/${session}/auth/keys`, {
    compression: false,
    encoder,
  });

export const WaDatabase = (session: string, scope: string) =>
  getOrOpenDB(`.session/${session}/store/${scope}`, {
    compression: true,
    encoder,
  });
