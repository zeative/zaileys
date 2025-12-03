import makeWASocket from 'baileys';
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
    const db = (path: string) => store.lowdb('stores', path);

    socket?.ev.on('messages.upsert', async ({ messages }) => {
      for (const message of messages) {
        await db('messages').set(message.key.id, message);
      }
    });
  }
}
