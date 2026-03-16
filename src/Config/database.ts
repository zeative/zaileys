import { BufferJSON } from 'baileys';
import { open, RootDatabase } from 'lmdb';

const encoder = {
  encode: (obj: any) => JSON.stringify(obj, BufferJSON.replacer),
  decode: (str: string) => JSON.parse(str, BufferJSON.reviver),
};

const _dbCache = new Map<string, RootDatabase>();

const getOrOpenDB = (path: string, options: any): RootDatabase => {
  if (!_dbCache.has(path)) {
    _dbCache.set(path, open({ path, ...options }));
  }
  return _dbCache.get(path)!;
};

export const CredsDatabase = (session: string) =>
  getOrOpenDB(`${session}/auth/creds`, {
    compression: false,
    encoder,
  });

export const KeysDatabase = (session: string) =>
  getOrOpenDB(`${session}/auth/keys`, {
    compression: false,
    encoder,
  });

export const WaDatabase = (session: string, scope: string) =>
  getOrOpenDB(`.session/${session}/store/${scope}`, {
    compression: true,
    encoder,
  });
