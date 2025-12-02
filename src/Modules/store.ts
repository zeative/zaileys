import { createSpinner } from "nanospinner";

export type StoreData = Record<string, any>;

export class NanoStore {
  private data = new Map<string, StoreData>();

  set(key: string, value: any) {
    this.data.set(key, { ...this.data.get(key), ...value });
  }

  get(key: string) {
    return this.data.get(key) || {};
  }

  update(key: string, updater: (current: StoreData) => any) {
    const current = this.get(key);
    this.set(key, updater(current));
  }

  delete(key: string) {
    this.data.delete(key);
  }

  has(key: string) {
    return this.data.has(key);
  }

  spinner = createSpinner("", { color: "green" });
}

export const store = new NanoStore();
