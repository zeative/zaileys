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

      // Batch upsert chats
      if (chats.length) {
        await this.client.db('chats').batchUpsert('all-chats', chats, 'id');
      }

      // Batch upsert contacts
      if (contacts.length) {
        await this.client.db('contacts').batchUpsert('all-contacts', contacts, 'id');
      }

      // Filter valid messages
      const validMessages = messages.filter((message) => {
        if (!message.message && !message.key.isViewOnce) return false;
        if (message?.category === 'peer') return false;
        if (message.message?.protocolMessage && !message.message?.protocolMessage?.memberLabel) return false;
        if (message.message?.groupStatusMentionMessage) return false;
        return true;
      });

      // Group messages by roomId and batch upsert
      if (validMessages.length) {
        const messagesByRoom = validMessages.reduce((acc, msg) => {
          const roomId = msg.key.remoteJid;
          if (!acc[roomId]) acc[roomId] = [];
          acc[roomId].push(msg);
          return acc;
        }, {} as Record<string, typeof messages>);

        await Promise.all(Object.entries(messagesByRoom).map(([roomId, msgs]) => this.client.db('messages').batchUpsert(roomId, msgs, 'key.id')));
      }
    });

    socket?.ev.on('messages.upsert', async ({ messages }) => {
      const validMessages = messages.filter((message) => {
        if (!message.message && !message.key.isViewOnce) return false;
        if (message?.category === 'peer') return false;
        if (message.message?.protocolMessage && !message.message?.protocolMessage?.memberLabel) return false;
        if (message.message?.groupStatusMentionMessage) return false;
        return true;
      });

      // Group by roomId and batch upsert
      if (validMessages.length) {
        const messagesByRoom = validMessages.reduce((acc, msg) => {
          const roomId = msg.key.remoteJid;
          if (!acc[roomId]) acc[roomId] = [];
          acc[roomId].push(msg);
          return acc;
        }, {} as Record<string, typeof messages>);

        await Promise.all(Object.entries(messagesByRoom).map(([roomId, msgs]) => this.client.db('messages').batchUpsert(roomId, msgs, 'key.id')));
      }
    });

    socket?.ev.on('chats.upsert', async (chats) => {
      if (chats.length) {
        await this.client.db('chats').batchUpsert('all-chats', chats, 'id');
      }
    });

    socket?.ev.on('contacts.upsert', async (contacts) => {
      if (contacts.length) {
        await this.client.db('contacts').batchUpsert('all-contacts', contacts, 'id');
      }
    });

    // Setup database indexes for fast queries
    await this.setupIndexes();
  }

  private async setupIndexes() {
    try {
      // Create indexes for frequently queried fields
      const messageDb = this.client.db('messages');
      const allRooms = await messageDb.all();

      for (const [roomId] of allRooms) {
        await messageDb.createIndex(roomId, 'key.id');
      }

      await this.client.db('chats').createIndex('all-chats', 'id');
      await this.client.db('contacts').createIndex('all-contacts', 'id');

      store.spinner.success(' Database indexes created');
    } catch (error) {
      // Non-critical, indexes will be created incrementally
      store.spinner.warn(' Could not create indexes (non-critical)');
    }
  }
}
