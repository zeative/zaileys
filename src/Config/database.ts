import { BufferJSON } from 'baileys';
import { createJetDB } from 'jetdb';

export const CredsDatabase = (session: string) =>
  createJetDB(`${session}/auth/creds.json`, {
    BufferJSON,
    cacheSize: 100,
    flushMode: 'sync',
    compression: 'none',
    enableIndexing: false,
  });

export const KeysDatabase = (session: string) =>
  createJetDB(`${session}/auth/keys.json`, {
    BufferJSON,
    size: 1024 * 1024,
    cacheSize: 2000,
    flushMode: 'sync',
    compression: 'deflate',
    enableIndexing: false,
    hotThreshold: 5,
  });

export const WaDatabase = (session: string, scope: string) =>
  createJetDB(`.session/${session}/store/${scope}.json`, {
    BufferJSON,
    cacheSize: 20000,
    debounceMs: 1000,
    flushMode: 'debounce',
    compression: 'deflate',
    serialization: 'json',
    enableIndexing: true,
    hotThreshold: 2,
    size: 5 * 1024 * 1024,
  });
