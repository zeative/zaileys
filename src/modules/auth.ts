import { initAuthCreds } from "baileys";
import { fromObject } from "../utils/decrypt";
import { tryAgain } from "../utils/helpers";
import { StoreHandler } from "./store";

export const AuthHandler = async (db: any) => {
  const creds = (await tryAgain(() => db.read("creds"))) || initAuthCreds();
  const store = await StoreHandler(db)

  return {
    db,
    store,
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [id: string]: any } = {};
          for (const id of ids) {
            let value = await tryAgain(() => db.read(`${type}-${id}`))
            if (type === "app-state-sync-key" && value) {
              value = fromObject(value);
            }
            data[id] = value;
          }
          return data;
        },
        set: async (data) => {
          for (const category in data) {
            for (const id in data[category as never] as any) {
              const value = data[category as never][id];
              const name = `${category}-${id}`;
              if (value) {
                await tryAgain(() => db.upsert(name, value))
              } else {
                await tryAgain(() => db.remove(name))
              }
            }
          }
        },
      },
    },
    clear: async () => {
      await tryAgain(() => db.clear())
    },
    saveCreds: async () => {
      await tryAgain(() => db.upsert("creds", creds))
    },
    removeCreds: async () => {
      await tryAgain(() => db.delete())
    },
  };
};
