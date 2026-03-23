import { BufferJSON } from 'baileys';
import { IStoreAdapter } from '../Types/store';
import { NeDBAdapter } from '../Library/nedb';

const encoder = {
  encode: (obj: any) => JSON.stringify(obj, BufferJSON.replacer),
  decode: (str: string) => JSON.parse(str, BufferJSON.reviver),
};

const _dbCache = new Map<string, IStoreAdapter>();

/**
 * Gets or opens a database store using NeDB.
 * Legacy JSON fallback removed as NeDB is environment-agnostic.
 */
const getOrOpenDB = (path: string, options: any): IStoreAdapter => {
  if (!_dbCache.has(path)) {
    _dbCache.set(path, new NeDBAdapter(path, options));
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
