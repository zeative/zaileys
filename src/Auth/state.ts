import { AuthenticationCreds, AuthenticationState, BufferJSON, initAuthCreds, proto, SignalDataTypeMap } from 'baileys';
import { mkdir, stat } from 'node:fs/promises';
import { createLowdb } from '../Modules/lowdb';
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

  const credsDb = createLowdb(`${folder}/auth/creds.json`, BufferJSON);
  const keysDb = createLowdb(`${folder}/auth/keys.json`, { ...BufferJSON, chunkSize: 512 * 1024 });

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
          const tasks: Promise<void>[] = [];

          for (const category in data) {
            for (const id in data[category as keyof SignalDataTypeMap]) {
              const value = data[category as keyof SignalDataTypeMap]![id];
              const key = `${category}:${id}`;

              if (value) {
                tasks.push(keysDb.set(key, value));
              } else {
                tasks.push(keysDb.delete(key).then(() => {}));
              }
            }
          }

          await Promise.all(tasks);
          await keysDb.write();
        },
      },
    },
    saveCreds: async () => {
      await credsDb.set('creds', creds);
      await credsDb.write();
    },
  };
};
