import { AuthenticationCreds, AuthenticationState, initAuthCreds, proto, SignalDataTypeMap } from 'baileys';
import * as _ from 'radashi';
import { CredsDatabase, KeysDatabase } from '../Config/database';
import { store } from '../Store';

export const useAuthState = async (folder: string): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> => {
  store.spinner.start(' Initializing auth state...');

  const credsDb = CredsDatabase(folder);
  const keysDb = KeysDatabase(folder);

  const credsData = await credsDb.get('creds') as AuthenticationCreds;
  const creds: AuthenticationCreds = credsData || initAuthCreds();

  if (credsData) {
    store.spinner.success(' Auth credentials loaded successfully');
  } else {
    store.spinner.success(' Initialized new auth session');
  }

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
          const operations: { key: string, value: any }[] = [];

          for (const category in data) {
            for (const id in data[category as keyof SignalDataTypeMap]) {
              const value = data[category as keyof SignalDataTypeMap]![id];
              const key = `${category}:${id}`;
              operations.push({ key, value });
            }
          }

          for (const chunk of _.cluster(operations, 500)) {
            const batch: { [_: string]: any } = {};
            const toDelete: string[] = [];

            chunk.forEach(({ key, value }) => {
              if (value) {
                batch[key] = value;
              } else {
                toDelete.push(key);
              }
            });

            if (Object.keys(batch).length > 0) {
              await keysDb.setMany(batch);
            }

            if (toDelete.length > 0) {
              await Promise.all(toDelete.map(k => keysDb.del(k)));
            }
          }
        },
      },
    },
    saveCreds: async () => {
      await credsDb.set('creds', creds);
    },
  };
};
