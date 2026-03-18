import { open, type RootDatabase } from 'lmdb'
import { Mutex } from 'async-mutex'
import { join } from 'node:path'

/**
 * Database abstraction for Zaileys V4.
 * Wraps LMDB with scoped access and concurrent write safety.
 */

export class Database {
  private static rootDb: RootDatabase
  private static mutex = new Mutex()

  private constructor(private readonly db: RootDatabase, readonly scope: string) {}

  /**
   * Initializes the root database.
   * @param path Path to the database directory.
   */
  static async init(path: string): Promise<void> {
    if (this.rootDb) return
    this.rootDb = open({
      path: join(path, 'zaileys-v4.db'),
      compression: true,
    })
  }

  /**
   * Creates or retrieves a scoped database instance.
   * @param scope The namespace for the database.
   */
  static scope(scope: string): Database {
    if (!this.rootDb) {
      throw new Error('Database not initialized. Call Database.init() first.')
    }
    return new Database(this.rootDb, scope)
  }

  /**
   * Gets a value from the database.
   */
  async get<T = any>(key: string): Promise<T | undefined> {
    return this.db.get(`${this.scope}:${key}`)
  }

  /**
   * Sets a value in the database with mutex safety.
   */
  async set<T = any>(key: string, value: T): Promise<boolean> {
    return Database.mutex.runExclusive(async () => {
      return this.db.put(`${this.scope}:${key}`, value)
    })
  }

  /**
   * Deletes a value from the database.
   */
  async del(key: string): Promise<boolean> {
    return Database.mutex.runExclusive(async () => {
      return this.db.remove(`${this.scope}:${key}`)
    })
  }

  /**
   * List all keys in the current scope.
   */
  async keys(): Promise<string[]> {
    const keys: string[] = []
    const prefix = `${this.scope}:`
    for (const key of this.db.getKeys({ start: prefix })) {
      if (typeof key === 'string' && key.startsWith(prefix)) {
        keys.push(key.substring(prefix.length))
      } else {
        break
      }
    }
    return keys
  }
}

/**
 * Convenience helper for scoping.
 */
export const db = (scope: string) => Database.scope(scope)
