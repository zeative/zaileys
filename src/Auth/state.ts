import { Mutex } from 'async-mutex';
import { AuthenticationCreds, AuthenticationState, BufferJSON, initAuthCreds, proto, SignalDataTypeMap } from 'baileys';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'path';
import { store } from '../Modules/store';

const fileLocks = new Map<string, Mutex>();

const getFileLock = (path: string): Mutex => {
  let mutex = fileLocks.get(path);

  if (!mutex) {
    mutex = new Mutex();
    fileLocks.set(path, mutex);
  }

  return mutex;
};

export const useAuthState = async (folder: string): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> => {
  store.spinner.start(' Initializing auth state...');

  const writeData = async (data, file: string) => {
    const filePath = join(folder, fixFileName(file)!);
    const mutex = getFileLock(filePath);

    return mutex.acquire().then(async (release) => {
      try {
        await writeFile(filePath, JSON.stringify(data, BufferJSON.replacer));
      } finally {
        release();
      }
    });
  };

  const readData = async (file: string) => {
    try {
      const filePath = join(folder, fixFileName(file)!);
      const mutex = getFileLock(filePath);

      return await mutex.acquire().then(async (release) => {
        try {
          const data = await readFile(filePath, { encoding: 'utf-8' });
          return JSON.parse(data, BufferJSON.reviver);
        } finally {
          release();
        }
      });
    } catch (error) {
      return null;
    }
  };

  const removeData = async (file: string) => {
    try {
      const filePath = join(folder, fixFileName(file)!);
      const mutex = getFileLock(filePath);

      return mutex.acquire().then(async (release) => {
        try {
          await unlink(filePath);
        } catch {
        } finally {
          release();
        }
      });
    } catch {}
  };

  const folderInfo = await stat(folder).catch(() => {});

  if (folderInfo) {
    if (!folderInfo.isDirectory()) {
      store.spinner.error(' Failed to open credentials\n');
      throw `found something that is not a directory at ${folder}, either delete it or specify a different location`;
    }
  } else {
    await mkdir(folder, { recursive: true });
  }

  const fixFileName = (file?: string) => file?.replace(/\//g, '__')?.replace(/:/g, '-');

  const creds: AuthenticationCreds = (await readData('creds.json')) || initAuthCreds();

  store.spinner.success(' Generate auth successfully');

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [_: string]: SignalDataTypeMap[typeof type] } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}.json`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }

              data[id] = value;
            }),
          );

          return data;
        },
        set: async (data) => {
          const tasks: Promise<void>[] = [];
          for (const category in data) {
            for (const id in data[category as keyof SignalDataTypeMap]) {
              const value = data[category as keyof SignalDataTypeMap]![id];
              const file = `${category}-${id}.json`;
              tasks.push(value ? writeData(value, file) : removeData(file));
            }
          }

          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => {
      return writeData(creds, 'creds.json');
    },
  };
};
