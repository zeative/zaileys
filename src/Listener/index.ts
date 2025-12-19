import makeWASocket from 'baileys';
import { Client } from '../Classes';
import { store } from '../Modules/store';
import { Calls } from './calls';
import { Connection } from './connection';
import { Messages } from './messages';
import { pickKeysFromArray } from '../Utils';

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
        await this.client.db('chats').set(chat.id, chat);
      }

      for (const contact of contacts) {
        await this.client.db('contacts').set(contact.id, contact);
      }

      for (const message of messages) {
        if (message?.category === 'peer') continue;
        if (!message.message && !message.key.isViewOnce && (!message.message?.groupStatusMentionMessage || !message.message?.statusMentionMessage)) continue;
        if (message.message?.protocolMessage && !message.message?.protocolMessage?.memberLabel) continue;

        // Skip messages older than 24 hours
        const timestamp = Number(message.messageTimestamp) * 1000;
        if (Date.now() - timestamp > 24 * 60 * 60 * 1000) continue;

        await this.client.db('messages').upsert(message.key.remoteJid, message, 'key.id');
      }
    });

    socket?.ev.on('messages.upsert', async ({ messages }) => {
      for (const message of messages) {
        if (message?.category === 'peer') continue;
        if (!message.message && !message.key.isViewOnce) continue;
        if (message.message?.protocolMessage && !message.message?.protocolMessage?.memberLabel) continue;

        // Skip messages older than 24 hours
        const timestamp = Number(message.messageTimestamp) * 1000;
        if (Date.now() - timestamp > 24 * 60 * 60 * 1000) continue;

        const senderLid = pickKeysFromArray([message?.key], ['participant', 'remoteJid']) || null;

        await this.client.db('messages').upsert(message.key.remoteJid, message, 'key.id');
      }
    });

    socket?.ev.on('chats.upsert', async (chats) => {
      for (const chat of chats) {
        await this.client.db('chats').upsert(chat.id, chat, 'id');
      }
    });

    socket?.ev.on('contacts.upsert', async (contacts) => {
      for (const contact of contacts) {
        await this.client.db('contacts').upsert(contact.id, contact, 'id');
      }
    });
  }
}
