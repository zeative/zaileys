import { AuthenticationCreds, AuthenticationState, initAuthCreds, proto, SignalDataTypeMap } from 'baileys';
import { CredsDatabase, KeysDatabase } from '../Config/database';
import { store } from '../Library/center-store';

export const useAuthState = async (folder: string): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> => {
  store.spinner.start(' Initializing auth state...');

  const credsDb = CredsDatabase(folder);
  const keysDb = KeysDatabase(folder);

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
    },
  };
};
