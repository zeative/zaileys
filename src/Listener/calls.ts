import makeWASocket, { jidNormalizedUser, WACallEvent } from 'baileys';
import z from 'zod';
import { Client } from '../Classes';
import { store } from '../Modules/store';
import { ListenerCallsType } from '../Types/calls';
import { normalizeText, pickKeysFromArray } from '../Utils';

export class Calls {
  constructor(private client: Client) {
    this.initialize();
  }

  async initialize() {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;

    socket.ev.on('call', async (calls) => {
      for (const call of calls) {
        const parsed = await this.parse(call);

        if (parsed) {
          await this.client.middleware.run({ calls: parsed });
          await this.client.plugins.execute(this.client, { messages: parsed });

          store.events.emit('calls', parsed);

          if (this.client.options?.autoRejectCall) {
            await socket.rejectCall(parsed.callId, parsed.callerId);
          }
        }
      }
    });
  }

  async parse(caller: WACallEvent) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;

    const output: Partial<z.infer<typeof ListenerCallsType>> = {};

    output.callId = caller.id;
    output.callerId = jidNormalizedUser(caller.from);

    output.callerName = await this.client.getRoomName(output.callerId);

    output.roomId = jidNormalizedUser(caller.chatId);
    output.roomName = normalizeText(socket?.user?.name || socket?.user?.verifiedName);

    output.date = caller.date;

    output.offline = caller.offline;
    output.status = caller.status;

    output.isVideo = !!caller.isVideo;
    output.isGroup = !!caller.isGroup;

    this.client.logs.call(output);

    return output;
  }
}
