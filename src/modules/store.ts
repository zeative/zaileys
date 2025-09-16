import { Client } from "../classes";
import { JsonDBInterface } from "../plugins/JsonDB";

export const StoreHandler = async (db: JsonDBInterface) => {
  return {
    bind: (client: Client) => {
      client?.socket?.ev.on("messaging-history.set", async (update) => {
        const { chats, contacts, messages } = update;

        for (const chat of chats) {
          await db.store("chats").write(chat as unknown as Record<string, unknown>);
        }

        for (const contact of contacts) {
          await db.store("contacts").write(contact as unknown as Record<string, unknown>);
        }

        for (const message of messages) {
          if (!message.message) return;
          if (message.message?.protocolMessage) return;
          await db.store("messages").write(message as unknown as Record<string, unknown>);
        }
      });

      client?.socket?.ev.on("messages.upsert", async ({ messages }) => {
        for (const message of messages) {
          await db.store("messages").write(message as unknown as Record<string, unknown>);
        }
      });

      client?.socket?.ev.on("chats.upsert", async (chats) => {
        for (const chat of chats) {
          await db.store("chats").write(chat as unknown as Record<string, unknown>);
        }
      });

      client?.socket?.ev.on("contacts.upsert", async (contacts) => {
        for (const contact of contacts) {
          await db.store("contacts").write(contact as unknown as Record<string, unknown>);
        }
      });

      client?.socket?.ev.on("groups.update", async ([event]) => {
        if (event.id) {
          const metadata = await client?.socket?.groupMetadata(event.id);
          client.cache.set(event.id, metadata);
        }
      });

      client?.socket?.ev.on("group-participants.update", async (event) => {
        const metadata = await client?.socket?.groupMetadata(event.id);
        client.cache.set(event.id, metadata);
      });
    },
  };
};
