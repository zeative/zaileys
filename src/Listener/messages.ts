import makeWASocket, { WAMessage } from 'baileys';
import { Client } from '../Classes';
import { store } from '../Modules/store';
import z from 'zod';
import { ListenerMessagesType } from '../Types/messages';

export class Messages {
  constructor(private client: Client) {
    this.initialize();
  }

  async initialize() {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;

    socket.ev.on('messages.upsert', async (ctx) => {
      const { messages, type } = ctx;
      if (type !== 'notify') return;

      for (const message of messages) {
        const parsed = await this.parse(message);

        await this.client.middleware.run({ messages: parsed });
        store.events.emit('messages', parsed);
      }
    });
  }

  async parse(message: WAMessage) {
    const output: Partial<z.infer<typeof ListenerMessagesType>> = {};

    output.chatType = 'audio';

    return output;
  }
}
