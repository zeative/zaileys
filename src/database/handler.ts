import { BufferJSON, initAuthCreds } from "baileys";
import Database from "better-sqlite3";
import { mkdirSync, writeFileSync } from "fs";
import { Kysely, MysqlDialect, PostgresDialect, SqliteDialect } from "kysely";
import mysql from "mysql2";
import path from "path";
import { Pool } from "pg";
import { URL } from "url";
import { z } from "zod";
import Client from "../classes/Client";
import Parser from "../classes/Parser";
import { fromObject } from "../helpers/utils";
import { AuthAdapterHandlerType, AuthenticationCreds, SignalDataTypeMap } from "../types/adapter/general";
import { AdapterDatabaseType } from "../types/classes/client";
import type { DB } from "./schema";

export const ConnectDB = (type: z.infer<typeof AdapterDatabaseType>["type"], url: string): Kysely<DB> => {
  if (type === "sqlite") {
    const filepath = url || "./db/zaileys.db";
    const resolvedPath = path.resolve(filepath);

    mkdirSync(path.dirname(resolvedPath), { recursive: true });
    writeFileSync(resolvedPath, "", { flag: "a" });

    return new Kysely<DB>({
      dialect: new SqliteDialect({
        database: new Database(resolvedPath),
      }),
    });
  }

  const conn = new URL(url);
  const protocol = conn.protocol.replace(":", "");

  if (type === "mysql") {
    return new Kysely<DB>({
      dialect: new MysqlDialect({
        pool: mysql.createPool({
          host: conn.hostname,
          user: conn.username,
          password: conn.password,
          database: conn.pathname.replace("/", ""),
          port: parseInt(conn.port || "3306", 10),
        }),
      }),
    });
  }

  if (type === "postgresql") {
    return new Kysely<DB>({
      dialect: new PostgresDialect({
        pool: new Pool({
          host: conn.hostname,
          user: conn.username,
          password: conn.password,
          database: conn.pathname.replace("/", ""),
          port: parseInt(conn.port || "5432", 10),
        }),
      }),
    });
  }

  throw new Error(`Unsupported database protocol: ${protocol}`);
};

export const MigrateDB = async (db: Kysely<DB>) => {
  await db.schema
    .createTable("auth")
    .ifNotExists()
    .addColumn("session", "varchar(50)", (col) => col.notNull())
    .addColumn("id", "varchar(80)", (col) => col.notNull())
    .addColumn("value", "text", (col) => col.defaultTo(null))
    .addUniqueConstraint("auth_session_id_unique", ["session", "id"])
    .execute();

  await db.schema
    .createTable("chats")
    .ifNotExists()
    .addColumn("session", "varchar(50)", (col) => col.notNull())
    .addColumn("id", "varchar(80)", (col) => col.notNull())
    .addColumn("value", "text", (col) => col.defaultTo(null))
    .addUniqueConstraint("chats_session_id_unique", ["session", "id"])
    .execute();

  await db.schema
    .createTable("contacts")
    .ifNotExists()
    .addColumn("session", "varchar(50)", (col) => col.notNull())
    .addColumn("id", "varchar(80)", (col) => col.notNull())
    .addColumn("value", "text", (col) => col.defaultTo(null))
    .addUniqueConstraint("contacts_session_id_unique", ["session", "id"])
    .execute();

  await db.schema
    .createTable("messages")
    .ifNotExists()
    .addColumn("session", "varchar(50)", (col) => col.notNull())
    .addColumn("id", "varchar(80)", (col) => col.notNull())
    .addColumn("value", "text", (col) => col.defaultTo(null))
    .addUniqueConstraint("messages_session_id_unique", ["session", "id"])
    .execute();

  await db.schema.createIndex("auth_session_idx").ifNotExists().on("auth").column("session").execute();
  await db.schema.createIndex("auth_id_idx").ifNotExists().on("auth").column("id").execute();
  await db.schema.createIndex("chats_session_idx").ifNotExists().on("chats").column("session").execute();
  await db.schema.createIndex("chats_id_idx").ifNotExists().on("chats").column("id").execute();
  await db.schema.createIndex("contacts_session_idx").ifNotExists().on("contacts").column("session").execute();
  await db.schema.createIndex("contacts_id_idx").ifNotExists().on("contacts").column("id").execute();
  await db.schema.createIndex("messages_session_idx").ifNotExists().on("messages").column("session").execute();
  await db.schema.createIndex("messages_id_idx").ifNotExists().on("messages").column("id").execute();
};

export const AuthAdapterHandler = async (db: Kysely<DB>, session: string): AuthAdapterHandlerType => {
  const TABLE_NAME = "auth";
  const RETRY_DELAY = 200;
  const MAX_RETRIES = 10;

  await MigrateDB(db);

  const retry = async <T>(fn: () => Promise<T>): Promise<T> => {
    for (let x = 0; x < MAX_RETRIES; x++) {
      try {
        return await fn();
      } catch (e) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY));
      }
    }
    throw new Error("Max retries reached");
  };

  const readData = async (id: string) => {
    const row = await retry(() => db.selectFrom(TABLE_NAME).select(["value"]).where("id", "=", id).where("session", "=", session).executeTakeFirst());

    if (!row?.value) return null;

    const credsStr = typeof row.value === "object" ? JSON.stringify(row.value) : row.value;
    return JSON.parse(credsStr, BufferJSON.reviver);
  };

  const writeData = async (id: string, value: object) => {
    const valueFixed = JSON.stringify(value, BufferJSON.replacer);

    await retry(() =>
      db
        .insertInto(TABLE_NAME)
        .values({
          session: session,
          id,
          value: valueFixed,
        })
        .onConflict((oc) => oc.columns(["session", "id"]).doUpdateSet({ value: valueFixed }))
        .execute()
    );
  };

  const removeData = async (id: string) => {
    await retry(() => db.deleteFrom(TABLE_NAME).where("id", "=", id).where("session", "=", session).execute());
  };

  const clearAll = async () => {
    await retry(() => db.deleteFrom(TABLE_NAME).where("session", "=", session).where("id", "!=", "creds").execute());
  };

  const removeAll = async () => {
    await retry(() => db.deleteFrom(TABLE_NAME).where("session", "=", session).execute());
  };

  const creds: AuthenticationCreds = (await readData("creds")) || initAuthCreds();

  return {
    state: {
      creds: creds,
      keys: {
        get: async (type, ids) => {
          const data: { [id: string]: SignalDataTypeMap[typeof type] } = {};
          for (const id of ids) {
            let value = await readData(`${type}-${id}`);
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
                await writeData(name, value);
              } else {
                await removeData(name);
              }
            }
          }
        },
      },
    },
    saveCreds: async () => {
      await writeData("creds", creds);
    },
    clear: async () => {
      await clearAll();
    },
    removeCreds: async () => {
      await removeAll();
    },
  };
};

export const StoreAdapterHandler = async (client: Client, db: Kysely<DB>, session: string) => {
  return {
    bind: (socket: Client["socket"]) => {
      const parser = new Parser(socket!, client, db);

      socket?.ev.on("connection.update", async (update) => {
        await parser.connection(update);
      });

      socket?.ev.on("call", async (callers) => {
        for (const caller of callers) {
          await parser.calls(caller);
        }
      });

      socket?.ev.on("messaging-history.set", async (update) => {
        const { chats, contacts, messages } = update;

        for (const chat of chats) {
          await db
            .insertInto("chats")
            .values({ session, id: chat.id!, value: JSON.stringify(chat) })
            .onConflict((oc) => oc.columns(["session", "id"]).doUpdateSet({ value: JSON.stringify(chat) }))
            .execute();
        }

        for (const contact of contacts) {
          await db
            .insertInto("contacts")
            .values({ session, id: contact.id!, value: JSON.stringify(contact) })
            .onConflict((oc) => oc.columns(["session", "id"]).doUpdateSet({ value: JSON.stringify(contact) }))
            .execute();
        }

        for (const message of messages) {
          if (!message.message) return;
          if (message.message?.protocolMessage) return;
          await db
            .insertInto("messages")
            .values({ session, id: message.key.id!, value: JSON.stringify(message) })
            .onConflict((oc) => oc.columns(["session", "id"]).doUpdateSet({ value: JSON.stringify(message) }))
            .execute();
        }
      });

      socket?.ev.on("messages.upsert", async ({ messages }) => {
        for (const message of messages) {
          if (!message.message) return;
          if (message.message?.protocolMessage) return;
          await parser.messages(message);
          await db
            .insertInto("messages")
            .values({ session, id: message.key.id!, value: JSON.stringify(message) })
            .onConflict((oc) => oc.columns(["session", "id"]).doUpdateSet({ value: JSON.stringify(message) }))
            .execute();
        }
      });

      socket?.ev.on("chats.upsert", async (chats) => {
        for (const chat of chats) {
          await db
            .insertInto("chats")
            .values({ session, id: chat.id!, value: JSON.stringify(chat) })
            .onConflict((oc) => oc.columns(["session", "id"]).doUpdateSet({ value: JSON.stringify(chat) }))
            .execute();
        }
      });

      socket?.ev.on("contacts.upsert", async (contacts) => {
        for (const contact of contacts) {
          await db
            .insertInto("contacts")
            .values({ session, id: contact.id!, value: JSON.stringify(contact) })
            .onConflict((oc) => oc.columns(["session", "id"]).doUpdateSet({ value: JSON.stringify(contact) }))
            .execute();
        }
      });

      socket?.ev.on("groups.update", async ([event]) => {
        const metadata = await socket?.groupMetadata(event.id!);
        client.cache.set(event.id!, metadata);
      });

      socket?.ev.on("group-participants.update", async (event) => {
        const metadata = await socket?.groupMetadata(event.id);
        client.cache.set(event.id, metadata);
      });
    },
  };
};
