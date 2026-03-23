import { Mutex } from 'async-mutex';
import mysql, { Pool } from 'mysql2/promise';

/**
 * Interface definition copied from zaileys/src/Types/store.ts
 * (Since we are in a sibling package, we'll keep it decoupled)
 */
export interface IStoreAdapter {
  get(id: string): Promise<any | null>;
  set(id: string, value: any): Promise<void>;
  del(id: string): Promise<void>;
}

export interface MySQLAdapterOptions {
  table?: string;
  batchInterval?: number;
  batchSize?: number;
}

export class MySQLAdapter implements IStoreAdapter {
  private pool: Pool;
  private table: string;
  private batchInterval: number;
  private batchSize: number;
  
  private writeBuffer = new Map<string, any>();
  private deleteBuffer = new Set<string>();
  private mutex = new Mutex();
  private timer: NodeJS.Timeout | null = null;

  constructor(config: mysql.PoolOptions, options: MySQLAdapterOptions = {}) {
    this.pool = mysql.createPool({
      ...config,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    this.table = options.table || 'zaileys_store';
    this.batchInterval = options.batchInterval || 1000;
    this.batchSize = options.batchSize || 500;

    this.init();
  }

  private async init() {
    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS \`${this.table}\` (
        \`id\` VARCHAR(255) PRIMARY KEY,
        \`data\` JSON NOT NULL,
        \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    this.startTimer();
  }

  private startTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => this.flush(), this.batchInterval);
  }

  async get(id: string): Promise<any | null> {
    // Check buffers first
    if (this.deleteBuffer.has(id)) return null;
    if (this.writeBuffer.has(id)) return this.writeBuffer.get(id);

    const [rows]: any = await this.pool.execute(
      `SELECT \`data\` FROM \`${this.table}\` WHERE \`id\` = ?`,
      [id]
    );

    return rows.length ? rows[0].data : null;
  }

  async set(id: string, value: any): Promise<void> {
    this.deleteBuffer.delete(id);
    this.writeBuffer.set(id, value);
    
    if (this.writeBuffer.size >= this.batchSize) {
      await this.flush();
    }
  }

  async del(id: string): Promise<void> {
    this.writeBuffer.delete(id);
    this.deleteBuffer.add(id);

    if (this.deleteBuffer.size >= this.batchSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.writeBuffer.size === 0 && this.deleteBuffer.size === 0) return;

    await this.mutex.runExclusive(async () => {
      const writes = Array.from(this.writeBuffer.entries());
      const deletes = Array.from(this.deleteBuffer);

      // Reset buffers immediately
      this.writeBuffer.clear();
      this.deleteBuffer.clear();

      try {
        // Handle deletions
        if (deletes.length > 0) {
          await this.pool.query(
            `DELETE FROM \`${this.table}\` WHERE \`id\` IN (?)`,
            [deletes]
          );
        }

        // Handle upserts
        if (writes.length > 0) {
          const values = writes.map(([id, data]) => [id, JSON.stringify(data)]);
          await this.pool.query(
            `INSERT INTO \`${this.table}\` (\`id\`, \`data\`) VALUES ? 
             ON DUPLICATE KEY UPDATE \`data\` = VALUES(\`data\`)`,
            [values]
          );
        }
      } catch (error) {
        console.error(`[MySQLAdapter] Flush failed:`, error);
        // Re-buffer on failure? (Optional: based on retry strategy)
      }
    });
  }

  async close() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
    await this.pool.end();
  }
}
