import { Mutex } from 'async-mutex';
import { readFile, writeFile, unlink, mkdir, readdir, rmdir } from 'fs/promises';
import { join } from 'path';

interface ChunkMeta {
  t: number;
  s: number;
  k: string;
}

class MutexPool {
  private static inst: MutexPool;
  private fLocks = new Map<string, Mutex>();
  private kLocks = new Map<string, Mutex>();
  private maxSize = 100;

  static get(): MutexPool {
    return this.inst || (this.inst = new MutexPool());
  }

  getFile(path: string): Mutex {
    let m = this.fLocks.get(path);
    if (!m) {
      if (this.fLocks.size >= this.maxSize) {
        const first = this.fLocks.keys().next().value;
        this.fLocks.delete(first);
      }
      m = new Mutex();
      this.fLocks.set(path, m);
    }
    return m;
  }

  getKey(key: string): Mutex {
    let m = this.kLocks.get(key);
    if (!m) {
      if (this.kLocks.size >= this.maxSize) {
        const first = this.kLocks.keys().next().value;
        this.kLocks.delete(first);
      }
      m = new Mutex();
      this.kLocks.set(key, m);
    }
    return m;
  }
}

export class Lowdb {
  private data: Map<string, any>;
  private path: string;
  private pool: MutexPool;
  private size: number;
  private chunkDir: string;
  private replacer: any;
  private reviver: any;

  constructor(path: string, bufferJSON?: any, size: number = 2 * 1024 * 1024) {
    this.data = new Map();
    this.path = path;
    this.pool = MutexPool.get();
    this.size = size;
    this.chunkDir = `${path}.c`;
    this.replacer = bufferJSON?.replacer || null;
    this.reviver = bufferJSON?.reviver || null;
  }

  async read(): Promise<Map<string, any>> {
    const m = this.pool.getFile(this.path);
    return m.runExclusive(async () => {
      try {
        const buf = await readFile(this.path, 'utf-8');
        const parsed = JSON.parse(buf, this.reviver);
        this.data.clear();

        const promises: Promise<void>[] = [];
        for (const [k, v] of Object.entries(parsed)) {
          if (this.isMeta(v)) {
            promises.push(this.loadChunk(k, v as ChunkMeta));
          } else {
            this.data.set(k, v);
          }
        }

        await Promise.all(promises);
        return this.data;
      } catch {
        await mkdir(join(this.path, '..'), { recursive: true });
        this.data.clear();
        return this.data;
      }
    });
  }

  async write(): Promise<void> {
    const m = this.pool.getFile(this.path);
    return m.runExclusive(async () => {
      const obj: Record<string, any> = {};
      const chunks: Promise<void>[] = [];

      for (const [k, v] of this.data) {
        const str = JSON.stringify(v, this.replacer);
        if (str.length > this.size) {
          chunks.push(this.saveChunk(k, v));
        } else {
          obj[k] = v;
        }
      }

      await Promise.all(chunks);
      const jsonStr = JSON.stringify(obj, this.replacer, 2);
      await writeFile(this.path, jsonStr, 'utf-8');
    });
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, value);
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key);
  }

  async delete(key: string): Promise<boolean> {
    const v = this.data.get(key);
    if (this.isMeta(v)) {
      await this.delChunk(key, v as ChunkMeta);
    }
    return this.data.delete(key);
  }

  has(key: string): boolean {
    return this.data.has(key);
  }

  async clear(): Promise<void> {
    const m = this.pool.getFile(this.path);
    return m.runExclusive(async () => {
      const dels: Promise<void>[] = [];
      for (const [k, v] of this.data) {
        if (this.isMeta(v)) {
          dels.push(this.delChunk(k, v as ChunkMeta));
        }
      }
      await Promise.all(dels);
      this.data.clear();
      await writeFile(this.path, '{}', 'utf-8');
    });
  }

  keys(): string[] {
    return Array.from(this.data.keys());
  }

  sizeOf(key: string): number {
    const v = this.data.get(key);
    return v ? JSON.stringify(v, this.replacer).length : 0;
  }

  async update<T>(key: string, fn: (v: T | undefined) => T): Promise<void> {
    this.data.set(key, fn(this.data.get(key)));
  }

  async push<T>(key: string, item: T): Promise<void> {
    const arr = this.data.get(key) || [];
    if (Array.isArray(arr)) {
      arr.push(item);
      this.data.set(key, arr);
    }
  }

  private async saveChunk(key: string, value: any): Promise<void> {
    const str = JSON.stringify(value, this.replacer);
    const total = Math.ceil(str.length / this.size);
    await mkdir(this.chunkDir, { recursive: true });

    const writes = [];
    for (let i = 0; i < total; i++) {
      const s = i * this.size;
      const chunk = str.substring(s, s + this.size);
      writes.push(writeFile(join(this.chunkDir, `${key}.${i}`), chunk, 'utf-8'));
    }

    await Promise.all(writes);
    this.data.set(key, { t: total, s: this.size, k: key } as ChunkMeta);
  }

  private async loadChunk(key: string, meta: ChunkMeta): Promise<void> {
    const reads = [];
    for (let i = 0; i < meta.t; i++) {
      reads.push(readFile(join(this.chunkDir, `${key}.${i}`), 'utf-8'));
    }

    const chunks = await Promise.all(reads);
    const data = JSON.parse(chunks.join(''), this.reviver);
    this.data.set(key, data);
  }

  private async delChunk(key: string, meta: ChunkMeta): Promise<void> {
    const dels = [];
    for (let i = 0; i < meta.t; i++) {
      dels.push(unlink(join(this.chunkDir, `${key}.${i}`)).catch(() => {}));
    }
    await Promise.all(dels);

    try {
      const files = await readdir(this.chunkDir);
      if (files.length === 0) await rmdir(this.chunkDir);
    } catch {}
  }

  private isMeta(v: any): v is ChunkMeta {
    return v?.t && v?.s && v?.k;
  }
}

export const createLowdb = (path: string, bufferJSON?: any, size?: number): Lowdb => new Lowdb(path, bufferJSON, size);
