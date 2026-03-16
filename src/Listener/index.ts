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
        const promises = chats.map(item => this.client.db('chats').put(item.id, item));
        await Promise.all(promises);
      });

      fireForget.add(async () => {
        const promises = contacts.map(item => this.client.db('contacts').put(item.id, item));
        await Promise.all(promises);
      });

      fireForget.add(async () => {
        const promises = messages.map(item => this.client.db('messages').put(item.key.id, item));
        await Promise.all(promises);
      });
    });

    socket?.ev.on('messages.upsert', async ({ messages }) => {
      fireForget.add(async () => {
        const promises = messages.map(item => this.client.db('messages').put(item.key.id, item));
        await Promise.all(promises);
      });
    });

    socket?.ev.on('chats.upsert', async (chats) => {
      fireForget.add(async () => {
        const promises = chats.map(item => this.client.db('chats').put(item.id, item));
        await Promise.all(promises);
      });
    });

    socket?.ev.on('contacts.upsert', async (contacts) => {
      fireForget.add(async () => {
        const promises = contacts.map(item => this.client.db('contacts').put(item.id, item));
        await Promise.all(promises);
      });
    });

  }
}
