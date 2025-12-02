import {
  initAuthCreds,
  BufferJSON,
  makeCacheableSignalKeyStore,
  type AuthenticationState,
} from "baileys";
import { promises as fs } from "fs";
import { join } from "path";
import { atomicWrite } from "./decrypt";
import { store } from "../Modules/store";

const KEY_MAP: {
  [key: string]:
    | "pre-key"
    | "session"
    | "sender-key"
    | "app-state-sync-key"
    | "app-state-sync-version";
} = {
  "pre-key": "pre-key",
  session: "session",
  "sender-key": "sender-key",
  "app-state-sync-key": "app-state-sync-key",
  "app-state-sync-version": "app-state-sync-version",
};

export type AuthState = {
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
};

export async function useAuthState(folder: string): Promise<AuthState> {
  await fs.mkdir(folder, { recursive: true });

  const credsPath = join(folder, "creds.json");
  const keyStore = {} as any;
  let saveDebounceTimeout: NodeJS.Timeout | undefined = undefined;

  let creds: AuthenticationState["creds"];
  try {
    const credsData = await fs.readFile(credsPath, { encoding: "utf-8" });
    creds = JSON.parse(credsData, BufferJSON.reviver);
  } catch (error) {
    console.warn("creds.json not found, creating new credentials.");
    creds = initAuthCreds();
  }

  const saveCreds = () => {
    return new Promise<void>((resolve, reject) => {
      clearTimeout(saveDebounceTimeout);
      saveDebounceTimeout = setTimeout(async () => {
        try {
          const data = JSON.stringify(creds, BufferJSON.replacer, 2);
          await atomicWrite(credsPath, Buffer.from(data, "utf-8"));
          resolve();
        } catch (err) {
          reject(err);
        }
      }, 1500);
    });
  };

  try {
    const files = await fs.readdir(folder);
    for (const file of files) {
      const path = join(folder, file);
      const stat = await fs.stat(path);
      if (file !== "creds.json" && file.endsWith(".json") && stat.isFile()) {
        const [key, id] = file.replace(".json", "").split("-", 2);
        if (key !== undefined && key in KEY_MAP) {
          const type = KEY_MAP[key];
          const data = await fs.readFile(path, { encoding: "utf-8" });
          keyStore[`${type}-${id}`] = JSON.parse(data, BufferJSON.reviver);
        }
      }
    }
  } catch (error) {
    console.error(error, "Failed to read session files");
  }

  return {
    state: {
      creds,
      keys: makeCacheableSignalKeyStore(
        {
          get: async (type, ids) => {
            const data: { [key: string]: any } = {};
            for (const id of ids) {
              const value = keyStore[`${type}-${id}`];
              if (value) {
                data[id] = value;
              }
            }
            return data;
          },
          set: async (data) => {
            for (const [type, inner] of Object.entries(data) as [string, any][]) {
              for (const [id, value] of Object.entries(inner) as [string, any][]) {
                const key = `${type}-${id}`;
                keyStore[key] = value;
                const filePath = join(folder, `${key}.json`);
                await atomicWrite(
                  filePath,
                  Buffer.from(JSON.stringify(value, BufferJSON.replacer), "utf-8")
                );
              }
            }
          },
        },
        store.logger
      ),
    },
    saveCreds,
  };
}
