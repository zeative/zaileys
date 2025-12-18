import { AuthenticationCreds, AuthenticationState, BufferJSON, initAuthCreds, proto, SignalDataTypeMap } from 'baileys';
import { mkdir, stat } from 'node:fs/promises';
import { createJetDB } from 'jetdb';
import { store } from '../Modules/store';

export const useAuthState = async (folder: string): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> => {
  store.spinner.start(' Initializing auth state...');

  const folderInfo = await stat(folder).catch(() => {});

  if (folderInfo) {
    if (!folderInfo.isDirectory()) {
      store.spinner.error(' Failed to open credentials\n');
      throw `found something that is not a directory at ${folder}, either delete it or specify a different location`;
    }
  } else {
    await mkdir(folder, { recursive: true });
  }

  // Optimized configuration for auth credentials (small, critical data)
  const credsDb = createJetDB(`${folder}/auth/creds.json`, {
    BufferJSON,
    cacheSize: 100, // Small cache for small auth data
    flushMode: 'sync', // Immediate flush for critical auth data
    compression: 'none', // No compression for small files
    enableIndexing: false, // No indexing needed for creds
  });

  // Optimized configuration for auth keys (larger, frequently accessed)
  const keysDb = createJetDB(`${folder}/auth/keys.json`, {
    BufferJSON,
    size: 512 * 1024, // 512KB chunks
    cacheSize: 1000, // Larger cache for auth keys
    flushMode: 'debounce', // Debounce for performance
    debounceMs: 500, // Longer debounce for batch updates
    compression: 'deflate', // Compress keys file (can be large)
    enableIndexing: false, // Direct key access, no indexing needed
    hotThreshold: 3, // Aggressive caching for frequently used keys
  });

  await Promise.all([credsDb.read(), keysDb.read()]);

  const creds: AuthenticationCreds = (await credsDb.get('creds')) || initAuthCreds();

  store.spinner.success(' Generate auth successfully');

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [_: string]: SignalDataTypeMap[typeof type] } = {};

          await Promise.all(
            ids.map(async (id) => {
              const key = `${type}:${id}`;
              let value = await keysDb.get(key);

              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }

              data[id] = value as SignalDataTypeMap[typeof type];
            }),
          );

          return data;
        },
        set: async (data) => {
          const setOperations: { key: string; value: any }[] = [];
          const deleteKeys: string[] = [];

          for (const category in data) {
            for (const id in data[category as keyof SignalDataTypeMap]) {
              const value = data[category as keyof SignalDataTypeMap]![id];
              const key = `${category}:${id}`;

              if (value) {
                setOperations.push({ key, value });
              } else {
                deleteKeys.push(key);
              }
            }
          }

          // Batch operations for better performance
          if (setOperations.length) {
            await keysDb.batchSet(setOperations);
          }
          if (deleteKeys.length) {
            await keysDb.batchDelete(deleteKeys);
          }

          await keysDb.flush();
        },
      },
    },
    saveCreds: async () => {
      await credsDb.set('creds', creds);
      await credsDb.write();
    },
  };
};
