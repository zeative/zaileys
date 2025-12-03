import makeWASocket from 'baileys';
import { Client } from '../Classes';
import { store } from '../Modules/store';

export class Messages {
  constructor(private client: Client) {
    this.initialize();
  }

  initialize() {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;

    socket.ev.on('messages.upsert', async (ctx) => {
      const { messages, type } = ctx;
      if (type !== 'notify') return;

      for (const message of messages) {
        await this.client.middleware.run(message);
      }

      store.events.emit('calls', ctx);
    });
  }
}
