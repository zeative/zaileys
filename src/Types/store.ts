export interface IStoreAdapter {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(prefix?: string): Promise<string[]>;
  getMany<T>(keys: string[]): Promise<Record<string, T>>;
  setMany<T>(data: Record<string, T>): Promise<void>;
  compact(): Promise<void>;
  close(): Promise<void>;
}
