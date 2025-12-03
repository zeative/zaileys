import { initAuthCreds, BufferJSON, makeCacheableSignalKeyStore, type AuthenticationState } from 'baileys';
import fs from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWrite } from './decrypt';
import { store } from '../Modules/store';
import { AuthStateType } from '../Types/auth';

const KEY_MAP = new Set(['pre-key', 'session', 'sender-key', 'app-state-sync-key', 'app-state-sync-version']);

export async function useAuthState(folder: string): Promise<AuthStateType> {
  store.spinner.start(' Initializing auth state...');

  await fs.mkdir(folder, { recursive: true });
  const credsPath = join(folder, 'creds.json');
  const keyStore: Record<string, any> = {};

  let creds: AuthenticationState['creds'];
  let saveTimeout: NodeJS.Timeout | null = null;

  try {
    const credsData = await fs.readFile(credsPath, 'utf-8');
    creds = JSON.parse(credsData, BufferJSON.reviver);
  } catch {
    creds = initAuthCreds();
  }

  store.spinner.update(' Loading credentials...');

  const saveCreds = () =>
    new Promise<void>((resolve, reject) => {
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(async () => {
        try {
          const data = JSON.stringify(creds, BufferJSON.replacer, 2);
          await atomicWrite(credsPath, Buffer.from(data, 'utf-8'));
          resolve();
        } catch (err) {
          reject(err);
        }
      }, 1500);
    });

  try {
    const files = await fs.readdir(folder);

    for (const file of files) {
      if (file === 'creds.json' || !file.endsWith('.json')) continue;

      const path = join(folder, file);
      const stat = await fs.stat(path);

      if (!stat.isFile()) continue;

      const [key, id] = file.slice(0, -5).split('-', 2);

      if (KEY_MAP.has(key) && id) {
        const raw = await fs.readFile(path, 'utf-8');
        keyStore[`${key}-${id}`] = JSON.parse(raw, BufferJSON.reviver);
      }
    }

    store.spinner.success(' Generate auth successfully');
  } catch (error) {
    store.spinner.error(' Failed to open credentials\n');
    throw error;
  }

  return {
    state: {
      creds,
      keys: makeCacheableSignalKeyStore(
        {
          get: async (type, ids) => {
            const data: Record<string, any> = {};

            for (const id of ids) {
              const value = keyStore[`${type}-${id}`];
              if (value) data[id] = value;
            }

            return data;
          },
          set: async (data) => {
            const writeTasks: Promise<void>[] = [];

            for (const [type, inner] of Object.entries(data)) {
              for (const [id, value] of Object.entries(inner)) {
                const key = `${type}-${id}`;
                keyStore[key] = value;

                const filePath = join(folder, `${key}.json`);
                writeTasks.push(atomicWrite(filePath, Buffer.from(JSON.stringify(value, BufferJSON.replacer), 'utf-8')));
              }
            }

            await Promise.all(writeTasks);
          },
        },
        store.logger,
      ),
    },
    saveCreds,
  };
}
