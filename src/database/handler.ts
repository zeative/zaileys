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

export const ConnectDB = (opts: Client["options"]): Kysely<DB> => {
  const { type, connection } = opts.database;

  if (type === "sqlite") {
    const filepath = connection.url || "./db/zaileys.db";
    const resolvedPath = path.resolve(filepath);

    mkdirSync(path.dirname(resolvedPath), { recursive: true });
    writeFileSync(resolvedPath, "", { flag: "a" });

    return new Kysely<DB>({
      dialect: new SqliteDialect({
        database: new Database(resolvedPath),
      }),
    });
  }

  const conn = new URL(connection.url);
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

export const MigrateDB = async (db: Kysely<DB>, opts: Client["options"]) => {
  await db.transaction().execute(async (trx) => {
    await trx.schema
      .createTable("auth")
      .ifNotExists()
      .addColumn("session", "char(36)", (col) => col.notNull())
      .addColumn("id", "char(36)", (col) => col.notNull().primaryKey())
      .addColumn("value", "text")
      .addUniqueConstraint("auth_session_id_unique", ["session", "id"])
      .execute();

    await trx.schema
      .createTable("chats")
      .ifNotExists()
      .addColumn("session", "char(36)", (col) => col.notNull())
      .addColumn("id", "char(36)", (col) => col.notNull().primaryKey())
      .addColumn("value", "text")
      .addUniqueConstraint("chats_session_id_unique", ["session", "id"])
      .execute();

    await trx.schema
      .createTable("contacts")
      .ifNotExists()
      .addColumn("session", "char(36)", (col) => col.notNull())
      .addColumn("id", "char(36)", (col) => col.notNull().primaryKey())
      .addColumn("value", "text")
      .addUniqueConstraint("contacts_session_id_unique", ["session", "id"])
      .execute();

    await trx.schema
      .createTable("messages")
      .ifNotExists()
      .addColumn("session", "char(36)", (col) => col.notNull())
      .addColumn("id", "char(36)", (col) => col.notNull().primaryKey())
      .addColumn("value", "text")
      .addUniqueConstraint("messages_session_id_unique", ["session", "id"])
      .execute();

    if (opts.loadLLMSchemas) {
      await trx.schema
        .createTable("llm_messages")
        .ifNotExists()
        .addColumn("uniqueId", "char(36)", (col) => col.notNull().primaryKey())
        .addColumn("channelId", "char(36)")
        .addColumn("model", "char(36)")
        .addColumn("role", "varchar(20)", (col) => col.notNull())
        .addColumn("content", "text", (col) => col.notNull())
        .addColumn("additional", "text")
        .addUniqueConstraint("llm_messages_id_unique", ["uniqueId"])
        .execute();

      await trx.schema
        .createTable("llm_personalization")
        .ifNotExists()
        .addColumn("uniqueId", "char(36)", (col) => col.notNull().primaryKey())
        .addColumn("senderId", "char(36)")
        .addColumn("content", "text", (col) => col.notNull())
        .addUniqueConstraint("llm_personalization_id_unique", ["uniqueId"])
        .execute();

      await trx.schema
        .createTable("llm_rag")
        .ifNotExists()
        .addColumn("metadata.id", "char(36)", (col) => col.notNull().primaryKey())
        .addColumn("pageContent", "text", (col) => col.notNull())
        .addUniqueConstraint("llm_rag_id_unique", ["metadata.id"])
        .execute();
    }

    await Promise.all([
      trx.schema.createIndex("auth_session_id_idx").ifNotExists().on("auth").columns(["session", "id"]).execute(),
      trx.schema.createIndex("chats_session_id_idx").ifNotExists().on("chats").columns(["session", "id"]).execute(),
      trx.schema.createIndex("contacts_session_id_idx").ifNotExists().on("contacts").columns(["session", "id"]).execute(),
      trx.schema.createIndex("messages_session_id_idx").ifNotExists().on("messages").columns(["session", "id"]).execute(),
      trx.schema.createIndex("llm_messages_uniqueId_idx").ifNotExists().on("llm_messages").column("uniqueId").execute(),
      trx.schema.createIndex("llm_messages_channelId_idx").ifNotExists().on("llm_messages").column("channelId").execute(),
      trx.schema.createIndex("llm_messages_model_idx").ifNotExists().on("llm_messages").column("model").execute(),
      trx.schema.createIndex("llm_messages_role_idx").ifNotExists().on("llm_messages").column("role").execute(),
      trx.schema.createIndex("llm_personalization_uniqueId_idx").ifNotExists().on("llm_personalization").column("uniqueId").execute(),
      trx.schema.createIndex("llm_personalization_senderId_idx").ifNotExists().on("llm_personalization").column("senderId").execute(),
      trx.schema.createIndex("llm_rag_id_idx").ifNotExists().on("llm_rag").column("metadata.id").execute(),
      trx.schema.createIndex("llm_rag_pageContent_idx").ifNotExists().on("llm_rag").column("pageContent").execute(),
    ]);
  });
};

export const AuthAdapterHandler = async (db: Kysely<DB>, session: string, opts: Client["options"]): AuthAdapterHandlerType => {
  const TABLE_NAME = "auth";
  const RETRY_DELAY = 200;
  const MAX_RETRIES = 10;

  await MigrateDB(db, opts);

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
