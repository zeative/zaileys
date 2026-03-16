import makeWASocket from 'baileys';
import { Client } from '../Classes';
import { groupCache } from '../Config/cache';
import { store } from '../Library/center-store';
import { fireForget } from '../Library/fire-forget';
import { Calls } from './calls';
import { Connection } from './connection';
import { Messages } from './messages';

export class Listener {
  connection: Connection;
  messages: Messages;
  calls: Calls;

  constructor(private client: Client) {
    this.connection = new Connection(client);
    this.messages = new Messages(client);
    this.calls = new Calls(client);

    this.initialize();
  }

  async initialize() {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;

    socket.ev.on('groups.update', async ([event]) => {
      fireForget.add(async () => {
        const metadata = await socket.groupMetadata(event.id);
        groupCache.set(event.id, metadata);
      });
    });

    socket.ev.on('group-participants.update', async (event) => {
      fireForget.add(async () => {
        const metadata = await socket.groupMetadata(event.id);
        groupCache.set(event.id, metadata);
      });
    });

    const processInChunks = async <T>(items: T[], action: (item: T) => Promise<any>) => {
      const chunkSize = 500;
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        await Promise.all(chunk.map(action));
      }
    };

    socket?.ev.on('messaging-history.set', async (update) => {
      const { chats, contacts, messages } = update;

      fireForget.add(async () => {
        await processInChunks(chats, (item) => this.client.db('chats').put(item.id, item));
      });

      fireForget.add(async () => {
        await processInChunks(contacts, (item) => this.client.db('contacts').put(item.id, item));
      });

      fireForget.add(async () => {
        await processInChunks(messages, (item) => this.client.db('messages').put(item.key.id, item));
      });
    });

    socket?.ev.on('messages.upsert', async ({ messages }) => {
      fireForget.add(async () => {
        await processInChunks(messages, (item) => this.client.db('messages').put(item.key.id, item));
      });
    });

    socket?.ev.on('chats.upsert', async (chats) => {
      fireForget.add(async () => {
        await processInChunks(chats, (item) => this.client.db('chats').put(item.id, item));
      });
    });

    socket?.ev.on('contacts.upsert', async (contacts) => {
      fireForget.add(async () => {
        await processInChunks(contacts, (item) => this.client.db('contacts').put(item.id, item));
      });
    });

  }
}
