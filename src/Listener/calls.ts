import makeWASocket, { jidNormalizedUser, WACallEvent } from 'baileys';
import { Client } from '../Classes';
import { store } from '../Library/center-store';
import { fireForget } from '../Library/fire-forget';
import { CallsContext } from '../Types/calls';
import { normalizeText } from '../Utils';

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
          fireForget.add(async () => this.client.middleware.run({ calls: parsed }));
          fireForget.add(async () => this.client.plugins.execute(this.client, { messages: parsed }));

          store.events.emit('calls', parsed);

          if (this.client.options?.autoRejectCall) {
            fireForget.add(async () => socket.rejectCall(parsed.callId, parsed.callerId));
          }
        }
      }
    });
  }

  async parse(caller: WACallEvent) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;

    const output: Partial<CallsContext> = {};

    output.callId = caller.id;
    output.callerId = jidNormalizedUser(caller.from);

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
