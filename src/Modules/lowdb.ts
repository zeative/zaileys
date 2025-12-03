import { Mutex } from 'async-mutex';
import { readFile, writeFile, unlink, stat, mkdir, readdir, rmdir } from 'fs/promises';
import { join } from 'path';

interface ChunkMetadata {
  chunkIndex: number;
  totalChunks: number;
  chunkSize: number;
  originalKey: string;
}

class LowdbMutexManager {
  private static instance: LowdbMutexManager;
  private fileLocks = new Map<string, Mutex>();
  private keyLocks = new Map<string, Mutex>();

  private constructor() {}

  public static getInstance(): LowdbMutexManager {
    if (!LowdbMutexManager.instance) {
      LowdbMutexManager.instance = new LowdbMutexManager();
    }
    return LowdbMutexManager.instance;
  }

  public getFileLock(filePath: string): Mutex {
    let mutex = this.fileLocks.get(filePath);
    if (!mutex) {
      mutex = new Mutex();
      this.fileLocks.set(filePath, mutex);
    }
    return mutex;
  }

  public getKeyLock(key: string): Mutex {
    let mutex = this.keyLocks.get(key);
    if (!mutex) {
      mutex = new Mutex();
      this.keyLocks.set(key, mutex);
    }
    return mutex;
  }
}

class Lowdb {
  private data: Map<string, any>;
  private dbPath: string;
  private mutexManager: LowdbMutexManager;
  private chunkSize: number;

  constructor(dbPath: string, chunkSize: number = 1024 * 1024) {
    // 1MB default chunk size
    this.data = new Map();
    this.dbPath = dbPath;
    this.mutexManager = LowdbMutexManager.getInstance();
    this.chunkSize = chunkSize;
  }

  /**
   * Initialize the database by reading existing data
   */
  public async read(): Promise<Map<string, any>> {
    const fileMutex = this.mutexManager.getFileLock(this.dbPath);

    return await fileMutex.runExclusive(async () => {
      try {
        const fileContent = await readFile(this.dbPath, 'utf-8');
        const parsed = JSON.parse(fileContent);

        // Handle chunked data
        this.data = new Map();
        for (const [key, value] of Object.entries(parsed)) {
          if (this.isChunkMetadata(value)) {
            // Reconstruct chunked data
            const reconstructed = await this.reconstructChunkedData(key, value as ChunkMetadata);
            this.data.set(key, reconstructed);
          } else {
            this.data.set(key, value);
          }
        }

        return this.data;
      } catch (error) {
        // If file doesn't exist or is corrupted, initialize with empty data
        await mkdir(join(this.dbPath, '..'), { recursive: true });
        this.data = new Map();
        return this.data;
      }
    });
  }

  /**
   * Write all data to the database file with chunking if necessary
   */
  public async write(): Promise<void> {
    const fileMutex = this.mutexManager.getFileLock(this.dbPath);

    return await fileMutex.runExclusive(async () => {
      const serializedData: Record<string, any> = {};

      for (const [key, value] of this.data.entries()) {
        const serializedValue = JSON.stringify(value, this.bufferReplacer);

        // Check if value exceeds chunk size
        if (serializedValue.length > this.chunkSize) {
          await this.writeChunkedData(key, value);
        } else {
          serializedData[key] = value;
        }
      }

      // Write non-chunked data to file
      const finalData = { ...serializedData };
      await writeFile(this.dbPath, JSON.stringify(finalData, null, 2));
    });
  }

  /**
   * Set a value in the database
   */
  public set<T = any>(key: string, value: T): void {
    const keyMutex = this.mutexManager.getKeyLock(key);
    keyMutex.runExclusive(() => {
      this.data.set(key, value);
    });
  }

  /**
   * Get a value from the database
   */
  public get<T = any>(key: string): T | undefined {
    const keyMutex = this.mutexManager.getKeyLock(key);
    return keyMutex.runExclusive(() => {
      return this.data.get(key) as T;
    });
  }

  /**
   * Delete a key from the database
   */
  public async delete(key: string): Promise<boolean> {
    const keyMutex = this.mutexManager.getKeyLock(key);

    return await keyMutex.runExclusive(async () => {
      // If the key was chunked, remove chunk files
      if (this.data.has(key)) {
        const value = this.data.get(key);
        if (this.isChunkMetadata(value)) {
          await this.removeChunkedData(key, value as ChunkMetadata);
        }
        return this.data.delete(key);
      }
      return false;
    });
  }

  /**
   * Check if a key exists in the database
   */
  public has(key: string): boolean {
    const keyMutex = this.mutexManager.getKeyLock(key);
    return keyMutex.runExclusive(() => {
      return this.data.has(key);
    });
  }

  /**
   * Clear all data from the database
   */
  public async clear(): Promise<void> {
    const fileMutex = this.mutexManager.getFileLock(this.dbPath);

    await fileMutex.runExclusive(async () => {
      // Clean up any chunk files
      for (const [key, value] of this.data.entries()) {
        if (this.isChunkMetadata(value)) {
          await this.removeChunkedData(key, value as ChunkMetadata);
        }
      }
      this.data.clear();
      await writeFile(this.dbPath, '{}');
    });
  }

  /**
   * Get all keys in the database
   */
  public keys(): string[] {
    return Array.from(this.data.keys());
  }

  /**
   * Get the size of data for a key (in memory)
   */
  public sizeOf(key: string): number {
    const value = this.data.get(key);
    if (value === undefined) return 0;
    return JSON.stringify(value, this.bufferReplacer).length;
  }

  /**
   * Update a value using a callback function
   */
  public update<T = any>(key: string, updater: (value: T | undefined) => T): void {
    const currentValue = this.get<T>(key);
    const newValue = updater(currentValue);
    this.set(key, newValue);
  }

  /**
   * Push an item to an array value
   */
  public push<T = any>(key: string, item: T): void {
    this.update<T[]>(key, (arr) => {
      if (!Array.isArray(arr)) arr = [];
      arr.push(item);
      return arr;
    });
  }

  /**
   * Remove an item from an array value
   */
  public removeItem<T = any>(key: string, item: T): void {
    this.update<T[]>(key, (arr) => {
      if (!Array.isArray(arr)) return arr;
      const index = arr.indexOf(item);
      if (index > -1) arr.splice(index, 1);
      return arr;
    });
  }

  private async writeChunkedData(key: string, value: any): Promise<void> {
    const valueStr = JSON.stringify(value, this.bufferReplacer);
    const totalChunks = Math.ceil(valueStr.length / this.chunkSize);

    const chunkDir = `${this.dbPath}.chunks`;
    await mkdir(chunkDir, { recursive: true });

    // Write chunks to separate files
    for (let i = 0; i < totalChunks; i++) {
      const start = i * this.chunkSize;
      const end = Math.min(start + this.chunkSize, valueStr.length);
      const chunk = valueStr.substring(start, end);

      const chunkFile = join(chunkDir, `${key}.chunk.${i}`);
      await writeFile(chunkFile, chunk);
    }

    // Store metadata in main database
    const metadata: ChunkMetadata = {
      chunkIndex: 0, // indicates this is chunked data
      totalChunks,
      chunkSize: this.chunkSize,
      originalKey: key,
    };

    this.data.set(key, metadata);
  }

  private async reconstructChunkedData(key: string, metadata: ChunkMetadata): Promise<any> {
    const { totalChunks } = metadata;
    const chunkDir = `${this.dbPath}.chunks`;
    let reconstructed = '';

    for (let i = 0; i < totalChunks; i++) {
      const chunkFile = join(chunkDir, `${key}.chunk.${i}`);
      try {
        const chunk = await readFile(chunkFile, 'utf-8');
        reconstructed += chunk;
      } catch (error) {
        // If chunk file is missing, data is corrupted
        throw new Error(`Chunk file missing for key: ${key}, chunk: ${i}`);
      }
    }

    try {
      return JSON.parse(reconstructed, this.bufferReviver);
    } catch (error) {
      throw new Error(`Failed to parse reconstructed data for key: ${key}`);
    }
  }

  private async removeChunkedData(key: string, metadata: ChunkMetadata): Promise<void> {
    const { totalChunks } = metadata;
    const chunkDir = `${this.dbPath}.chunks`;

    for (let i = 0; i < totalChunks; i++) {
      const chunkFile = join(chunkDir, `${key}.chunk.${i}`);
      try {
        await unlink(chunkFile);
      } catch (error) {
        // Ignore error if file doesn't exist
      }
    }

    // Remove chunk directory if empty
    try {
      const chunkDirStat = await stat(chunkDir);
      if (chunkDirStat.isDirectory()) {
        // Check if directory is empty and remove if so
        const dirContents = await readdir(chunkDir);
        if (dirContents.length === 0) {
          await rmdir(chunkDir);
        }
      }
    } catch (error) {
      // Ignore error if directory doesn't exist
    }
  }

  private isChunkMetadata(value: any): value is ChunkMetadata {
    return value && typeof value === 'object' && 'chunkIndex' in value && 'totalChunks' in value && 'chunkSize' in value && 'originalKey' in value;
  }

  private bufferReplacer(key: string, value: any): any {
    if (Buffer.isBuffer(value)) {
      return { data: Array.from(value), type: 'Buffer' };
    }
    return value;
  }

  private bufferReviver(key: string, value: any): any {
    if (value && typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)) {
      return Buffer.from(value.data);
    }
    return value;
  }
}

// Export a factory function to create a new instance
export const createLowdb = (dbPath: string, chunkSize?: number): Lowdb => {
  return new Lowdb(dbPath, chunkSize);
};

export { Lowdb };
