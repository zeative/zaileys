import { BufferJSON } from "baileys";
import { existsSync, mkdirSync, readdirSync, unlinkSync, readFileSync, renameSync, writeFileSync } from "fs";
import lowdb from "lowdb";
import FileSync from "lowdb/adapters/FileSync";
import { dirname } from "path";
import { toJson, toString } from "../utils/helpers";

// Type definitions for lowdb
interface Store {
  read: (id: string) => Promise<unknown>;
  write: (obj: Record<string, unknown>) => Promise<void>;
}

export interface JsonDBInterface {
  initialize(session: string): Promise<void>;
  store(key: string): Store;
  upsert(id: string, value: unknown): Promise<void>;
  read(id: string): Promise<unknown>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  delete(): Promise<void>;
}

export interface JsonDBInterface {
  initialize(session: string): Promise<void>;
  store(key: string): Store;
  upsert(id: string, value: unknown): Promise<void>;
  read(id: string): Promise<unknown>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  delete(): Promise<void>;
}

/* eslint-disable @typescript-eslint/no-unused-vars */

const CHUNK_SIZE = 1000;

export class JsonDB implements JsonDBInterface {
  private session = "zaileys-sessions";
  private db!: lowdb.LowdbSync<unknown[]>;
  private storeDir!: string;

  async initialize(session: string) {
    this.session = session;
    const authPath = `sessions/${this.session}/auth.json`;
    this.storeDir = `sessions/${this.session}/stores`;
    const dirAuth = dirname(authPath);
    if (!existsSync(dirAuth)) mkdirSync(dirAuth, { recursive: true });
    if (!existsSync(this.storeDir)) mkdirSync(this.storeDir, { recursive: true });
    const adapter = new FileSync(authPath);
    this.db = lowdb(adapter);
    this.db.defaults([]).write();
  }

  private tryRecoverRaw(raw: string): unknown | null {
    const s = raw.trim();
    try {
      return JSON.parse(s);
    } catch (_error: unknown) {
      try {
        const a = s.indexOf("[");
        const b = s.lastIndexOf("]");
        if (a !== -1 && b !== -1 && b > a) {
          const sub = s.slice(a, b + 1);
          return JSON.parse(sub);
        }
      } catch (_error: unknown) { 
        // Ignore error and continue
      }
      try {
        const wrapped = `[${s.replace(/}\s*{/g, "},{")}]`;
        return JSON.parse(wrapped);
      } catch (_error: unknown) { 
        // Ignore error and continue
      }
      try {
        const lines = s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const parsed = lines.map(l => {
          try { return JSON.parse(l); } catch (_error: unknown) { return null; }
        }).filter(Boolean);
        if (parsed.length) return parsed;
      } catch (_error: unknown) { 
        // Ignore error and continue
      }
    }
    return null;
  }

  private async chunks(key: string): Promise<Record<string, unknown>[]> {
    const files = readdirSync(this.storeDir)
      .filter(f => f.startsWith(`${key}-`) && f.endsWith(".json"))
      .sort();
    const result: Record<string, unknown>[] = [];
    for (const file of files) {
      const full = `${this.storeDir}/${file}`;
      const adapter = new FileSync(full);
      const db = lowdb(adapter) as lowdb.LowdbSync<unknown[]>;
      try {
        db.defaults([]).write();
        result.push(...toJson(db.value()) as Record<string, unknown>[]);
      } catch {
        let raw = "";
        try { raw = readFileSync(full, "utf8"); } catch (_error: unknown) { raw = ""; }
        const recovered = raw ? this.tryRecoverRaw(raw) : null;
        if (recovered) {
          db.setState(Array.isArray(recovered) ? recovered : [recovered]).write();
          result.push(...toJson(db.value()) as Record<string, unknown>[]);
        } else {
          const corrupt = `${full}.corrupt.${Date.now()}`;
          try { renameSync(full, corrupt); } catch (_renameErr: unknown) { 
            // Ignore error and continue
          }
          try { writeFileSync(full, "[]", "utf8"); } catch (_writeFileErr: unknown) { 
              // Ignore error and continue
            }
        }
      }
    }
    return result;
  }

  private async writeChunks(key: string, items: Record<string, unknown>[]) {
    readdirSync(this.storeDir)
      .filter(f => f.startsWith(`${key}-`) && f.endsWith(".json"))
      .forEach(f => unlinkSync(`${this.storeDir}/${f}`));
    let index = 0;
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      const file = `${this.storeDir}/${key}-${index}.json`;
      const adapter = new FileSync(file);
      const db = lowdb(adapter) as lowdb.LowdbSync<Record<string, unknown>[]>;
      db.setState(chunk).write();
      try {
        db.write();
      } catch (err: unknown) {
        if ((err as { code?: string })?.code === "ENOENT") {
          try {
            renameSync(`${file}.tmp`, file);
          } catch (_renameErr: unknown) {
            try { db.write(); } catch (_writeErr: unknown) {
              try { writeFileSync(file, JSON.stringify(chunk), "utf8"); } catch (_writeFileErr: unknown) { 
                // Ignore error and continue
              }
            }
          }
        } else {
          throw err;
        }
      }
      index++;
    }
  }

  store(key: string): Store {
    return {
      read: async (id: string) => {
        const list = await this.chunks(key);
        const row = list.find(i => i.id === id);
        return row ? JSON.parse(row.value as string) : null;
      },
      write: async (obj: Record<string, unknown>) => {
        const list = await this.chunks(key);
        const id = (obj.key && typeof obj.key === "object" && "id" in obj.key) ? obj.key.id : obj.id;
        const serialized = JSON.stringify(obj);
        const idx = list.findIndex(i => i.id === id);
        if (idx !== -1) list[idx].value = serialized;
        else list.push({ id, value: serialized });
        await this.writeChunks(key, list);
      }
    };
  }

  async upsert(id: string, value: unknown) {
    const replacer = JSON.stringify(value, BufferJSON.replacer);
    const dbValue = this.db.value();
    const data = (Array.isArray(dbValue) ? dbValue : []) as Record<string, unknown>[];
    const idx = data.findIndex((i: Record<string, unknown>) => i.id === id);
    if (idx !== -1) {
      data[idx].value = replacer;
    } else {
      data.push({ id, value: replacer });
    }
    this.db.setState(data).write();
  }

  async read(id: string) {
    const dbValue = this.db.value();
    const data = (Array.isArray(dbValue) ? dbValue : []) as Record<string, unknown>[];
    const row = data.find((i: Record<string, unknown>) => i.id === id);
    if (!row || !row.value) return null;
    const creds = typeof row.value === "object" ? toString(row.value) : row.value as string;
    return JSON.parse(creds, BufferJSON.reviver);
  }

  async remove(id: string) {
    const dbValue = this.db.value();
    const data = (Array.isArray(dbValue) ? dbValue : []) as Record<string, unknown>[];
    const filtered = data.filter((i: Record<string, unknown>) => i.id !== id);
    this.db.setState(filtered).write();
  }

  async clear() {
    const dbValue = this.db.value();
    const data = (Array.isArray(dbValue) ? dbValue : []) as Record<string, unknown>[];
    const filtered = data.filter((i: Record<string, unknown>) => i.id === "creds");
    this.db.setState(filtered).write();
  }

  async delete() {
    this.db.setState([]);
    await this.db.write();
  }
}