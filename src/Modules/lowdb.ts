import { Mutex } from 'async-mutex';
import { readFile, writeFile, unlink, mkdir, readdir, rmdir } from 'fs/promises';
import { join, dirname } from 'path';

interface ChunkManifest {
  v: 1;
  k: string;
  t: number;
  s: number;
  c: number;
  m: string;
}

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

  getFile(p: string): Mutex {
    let m = this.fLocks.get(p);
    if (!m) {
      if (this.fLocks.size >= this.maxSize) {
        const f = this.fLocks.keys().next().value;
        this.fLocks.delete(f);
      }
      m = new Mutex();
      this.fLocks.set(p, m);
    }
    return m;
  }

  getKey(k: string): Mutex {
    let m = this.kLocks.get(k);
    if (!m) {
      if (this.kLocks.size >= this.maxSize) {
        const f = this.kLocks.keys().next().value;
        this.kLocks.delete(f);
      }
      m = new Mutex();
      this.kLocks.set(k, m);
    }
    return m;
  }
}

type FlushMode = 'manual' | 'sync' | 'debounce';

export class Lowdb {
  private data: Map<string, any>;
  private path: string;
  private pool: MutexPool;
  private size: number;
  private chunkDir: string;
  private replacer: any;
  private reviver: any;

  private loaded = false;
  private flushMode: FlushMode;
  private debounceMs: number;
  private flushTimer: NodeJS.Timeout | null = null;
  private dirty = false;

  constructor(path: string, bufferJSON?: any, size: number = 2 * 1024 * 1024, flushMode: FlushMode = 'debounce', debounceMs = 200) {
    this.data = new Map();
    this.path = path;
    this.pool = MutexPool.get();
    this.size = size;
    this.chunkDir = `${path}.c`;
    this.replacer = bufferJSON?.replacer || null;
    this.reviver = bufferJSON?.reviver || null;
    this.flushMode = flushMode;
    this.debounceMs = debounceMs;
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) {
      await this.read();
      this.loaded = true;
    }
  }

  private scheduleFlush(): void {
    if (this.flushMode === 'manual') return;
    if (this.flushMode === 'sync') {
      void this.write();
      return;
    }
    this.dirty = true;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      if (!this.dirty) return;
      this.dirty = false;
      void this.write();
    }, this.debounceMs);
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
        this.loaded = true;
        return this.data;
      } catch {
        await mkdir(dirname(this.path), { recursive: true });
        this.data.clear();
        this.loaded = true;
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
        if (this.isMeta(v)) {
          obj[k] = v;
          continue;
        }

        const str = JSON.stringify(v, this.replacer);
        if (str.length > this.size) {
          chunks.push(
            this.saveChunk(k, v).then((meta) => {
              obj[k] = meta;
            }),
          );
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
    await this.ensureLoaded();
    const keyMutex = this.pool.getKey(key);
    await keyMutex.runExclusive(async () => {
      this.data.set(key, value);
      this.scheduleFlush();
    });
  }

  async get<T>(key: string): Promise<T | undefined> {
    await this.ensureLoaded();
    return this.data.get(key);
  }

  async delete(key: string): Promise<boolean> {
    await this.ensureLoaded();
    const keyMutex = this.pool.getKey(key);
    return keyMutex.runExclusive(async () => {
      const v = this.data.get(key);
      if (this.isMeta(v)) {
        await this.delChunk(key, v as ChunkMeta);
      }
      const res = this.data.delete(key);
      this.scheduleFlush();
      return res;
    });
  }

  private async saveChunk(key: string, value: any): Promise<ChunkMeta> {
    const str = JSON.stringify(value, this.replacer);
    const buf = Buffer.from(str, 'utf-8');
    const total = Math.ceil(buf.length / this.size);
    await mkdir(this.chunkDir, { recursive: true });

    const manifest: ChunkManifest = {
      v: 1,
      k: key,
      t: total,
      s: this.size,
      c: buf.length,
      m: Date.now().toString(36),
    };

    const writes: Promise<void>[] = [];
    for (let i = 0; i < total; i++) {
      const start = i * this.size;
      const end = Math.min(start + this.size, buf.length);
      const chunk = buf.subarray(start, end);
      writes.push(writeFile(join(this.chunkDir, `${key}.${i}.json`), JSON.stringify({ i, d: chunk.toString('base64') })));
    }
    writes.push(writeFile(join(this.chunkDir, `${key}.manifest.json`), JSON.stringify(manifest)));

    await Promise.all(writes);

    return { t: total, s: this.size, k: key } as ChunkMeta;
  }

  private async loadChunk(key: string, meta: ChunkMeta): Promise<void> {
    const manifestPath = join(this.chunkDir, `${key}.manifest.json`);
    const manifest: ChunkManifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
    const reads: Promise<Buffer>[] = [];
    for (let i = 0; i < manifest.t; i++) {
      reads.push(readFile(join(this.chunkDir, `${key}.${i}.json`), 'utf-8').then((d) => Buffer.from(JSON.parse(d).d, 'base64')));
    }

    const chunks = await Promise.all(reads);
    const fullBuf = Buffer.concat(chunks);
    const data = JSON.parse(fullBuf.toString('utf-8'), this.reviver);
    this.data.set(key, data);
  }

  private async delChunk(key: string, meta: ChunkMeta): Promise<void> {
    const dels: Promise<void>[] = [];
    for (let i = 0; i < meta.t; i++) {
      dels.push(unlink(join(this.chunkDir, `${key}.${i}.json`)).catch(() => {}));
    }
    dels.push(unlink(join(this.chunkDir, `${key}.manifest.json`)).catch(() => {}));
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

export const createLowdb = (
  path: string,
  options?: {
    BufferJSON?: any;
    size?: number;
    flushMode?: FlushMode;
    debounceMs?: number;
  },
): Lowdb => new Lowdb(path, options?.BufferJSON, options?.size, options?.flushMode, options?.debounceMs);
