import makeWASocket, { isJidMetaAI } from 'baileys';
import { Client } from '../Classes';
import { store } from '../Modules/store';
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
      const metadata = await socket.groupMetadata(event.id);
      store.groupCache.set(event.id, metadata);
    });

    socket.ev.on('group-participants.update', async (event) => {
      const metadata = await socket.groupMetadata(event.id);
      store.groupCache.set(event.id, metadata);
    });

    socket?.ev.on('messaging-history.set', async (update) => {
      const { chats, contacts, messages } = update;

      for (const chat of chats) {
        // Simpan langsung tanpa chunking
        await this.client.db('chats').set(chat.id, chat);
      }

      for (const contact of contacts) {
        // Simpan langsung tanpa chunking
        await this.client.db('contacts').set(contact.id, contact);
      }

      for (const message of messages) {
        if (!message.message && !message.key.isViewOnce) return;
        if (message?.category === 'peer') return;
        if (message.message?.protocolMessage && !message.message?.protocolMessage?.memberLabel) return;
        if (message.message?.groupStatusMentionMessage) return;

        await this.client.db('messages').upsert(message.key.remoteJid, message, 'key.id');
      }
    });

    socket?.ev.on('messages.upsert', async ({ messages }) => {
      for (const message of messages) {
        if (!message.message && !message.key.isViewOnce) return;
        if (message?.category === 'peer') return;
        if (message.message?.protocolMessage && !message.message?.protocolMessage?.memberLabel) return;
        if (message.message?.groupStatusMentionMessage) return;

        await this.client.db('messages').upsert(message.key.remoteJid, message, 'key.id');
      }
    });

    socket?.ev.on('chats.upsert', async (chats) => {
      for (const chat of chats) {
        // Simpan langsung tanpa chunking
        await this.client.db('chats').set(chat.id, chat);
      }
    });

    socket?.ev.on('contacts.upsert', async (contacts) => {
      for (const contact of contacts) {
        // Simpan langsung tanpa chunking
        await this.client.db('contacts').set(contact.id, contact);
      }
    });
  }
}
