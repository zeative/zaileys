import makeWASocket, { getAggregateVotesInPollMessage } from 'baileys';
import { Client } from '../Classes';
import { store } from '../Modules/store';
import { Calls } from './calls';
import { Connection } from './connection';
import { Messages } from './messages';

export class Listener {
  constructor(private client: Client) {
    new Connection(client);
    new Messages(client);
    new Calls(client);

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
        await this.client.db('chats').push(chat.id, chat);
      }

      for (const contact of contacts) {
        await this.client.db('contacts').push(contact.id, contact);
      }

      for (const message of messages) {
        if (!message.message) return;
        if (message?.category === 'peer') return;
        if (message.message?.protocolMessage) return;

        await this.client.db('messages').push(message.key.remoteJid, message);
      }
    });

    socket?.ev.on('messages.upsert', async ({ messages }) => {
      for (const message of messages) {
        if (!message.message) return;
        if (message?.category === 'peer') return;
        if (message.message?.protocolMessage) return;

        await this.client.db('messages').push(message.key.remoteJid, message);
      }
    });

    socket?.ev.on('chats.upsert', async (chats) => {
      for (const chat of chats) {
        await this.client.db('chats').push(chat.id, chat);
      }
    });

    socket?.ev.on('contacts.upsert', async (contacts) => {
      for (const contact of contacts) {
        await this.client.db('contacts').push(contact.id, contact);
      }
    });

    socket?.ev.on('messages.update', async (events) => {
      console.log('🔍 ~ initialize ~ src/Listener/index.ts:72 ~ events:', events);
      for (const { key, update } of events) {
        if (!update.pollUpdates) continue;

        const pollCreation = await this.client.db('messages').get(key.remoteJid);
        if (!pollCreation) continue;

        const aggregation = getAggregateVotesInPollMessage({
          message: pollCreation,
          pollUpdates: update.pollUpdates,
        });

        console.log('poll aggregation:', aggregation);
      }
    });
  }
}
