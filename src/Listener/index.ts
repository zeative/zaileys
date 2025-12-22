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

    socket?.ev.on('messaging-history.set', async (update) => {
      const { chats, contacts, messages } = update;

      fireForget.add(async () => {
        await this.client.db('chats').batchUpsert('chats', chats, 'id');
      });

      fireForget.add(async () => {
        await this.client.db('contacts').batchUpsert('contacts', contacts, 'id');
      });

      fireForget.add(async () => {
        await this.client.db('messages').batchUpsert('messages', messages, 'key.id');
      });
    });

    socket?.ev.on('messages.upsert', async ({ messages }) => {
      fireForget.add(async () => {
        await this.client.db('messages').batchUpsert('messages', messages, 'key.id');
      });
    });

    socket?.ev.on('chats.upsert', async (chats) => {
      fireForget.add(async () => {
        await this.client.db('chats').batchUpsert('chats', chats, 'id');
      });
    });

    socket?.ev.on('contacts.upsert', async (contacts) => {
      fireForget.add(async () => {
        await this.client.db('contacts').batchUpsert('contacts', contacts, 'id');
      });
    });

    await this.client.db('messages').createIndex('messages', 'key.remoteJid');
    await this.client.db('messages').createIndex('messages', 'key.id');

    await this.client.db('chats').createIndex('chats', 'id');
    await this.client.db('contacts').createIndex('contacts', 'id');
  }
}
