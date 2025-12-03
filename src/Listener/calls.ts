import makeWASocket, { WACallEvent } from 'baileys';
import { Client } from '../Classes';
import { store } from '../Modules/store';
import z from 'zod';
import { ListenerCallsType } from '../Types/calls';

export class Calls {
  constructor(private client: Client) {
    this.initialize();
  }

  async initialize() {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;

    socket.ev.on('call', async (calls) => {
      for (const call of calls) {
        const parsed = await this.parse(call);
        if (!parsed) continue;

        await this.client.middleware.run({ calls: parsed });
        store.events.emit('calls', parsed);
      }
    });
  }

  async parse(caller: WACallEvent) {
    const output: Partial<z.infer<typeof ListenerCallsType>> = {};

    output.callId = caller.id;
    output.callerId = caller.from;
    output.roomId = caller.chatId;

    output.date = caller.date;
    output.offline = caller.offline;
    output.status = caller.status;

    output.isVideo = !!caller.isVideo;
    output.isGroup = !!caller.isGroup;

    return output;
  }
}
