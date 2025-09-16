import { initAuthCreds } from "baileys";
import { fromObject } from "../utils/decrypt";
import { tryAgain } from "../utils/helpers";
import { StoreHandler } from "./store";
import { JsonDBInterface } from "../plugins/JsonDB";
import { SignalDataTypeMap, SignalDataSet } from "baileys";

export const AuthHandler = async (db: JsonDBInterface) => {
  const creds = (await tryAgain(() => db.read("creds"))) || initAuthCreds();
  const store = await StoreHandler(db);

  return {
    db,
    store,
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          for (const id of ids) {
            let value = await tryAgain(() => db.read(`${type}-${id}`));
            if (type === "app-state-sync-key" && value) {
              value = fromObject(value as Record<string, unknown>);
            }
            
            if (value !== null && value !== undefined) {
              data[id] = value as SignalDataTypeMap[T];
            }
          }
          return data;
        },
        set: async (data: SignalDataSet) => {
          for (const category in data) {
            for (const id in data[category as keyof SignalDataSet] as Record<string, unknown>) {
              const value = data[category as keyof SignalDataSet]![id];
              const name = `${category}-${id}`;
              if (value) {
                await tryAgain(() => db.upsert(name, value));
              } else {
                await tryAgain(() => db.remove(name));
              }
            }
          }
        },
      },
    },
    clear: async () => {
      await tryAgain(() => db.clear());
    },
    saveCreds: async () => {
      await tryAgain(() => db.upsert("creds", creds));
    },
    removeCreds: async () => {
      await tryAgain(() => db.delete());
    },
  };
};