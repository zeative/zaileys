import makeWASocket from 'baileys';
import z from 'zod';
import { registerAuthCreds } from '../Auth';
import { store } from '../Modules/store';
import { parseZod } from '../Modules/zod';
import { ClientOptionsType, EventCallbackType, EventEnumType } from '../Types';
import { autoDisplayBanner } from '../Utils/banner';

export class Client {
  constructor(public options: z.infer<typeof ClientOptionsType>) {
    this.options = parseZod(ClientOptionsType, options);
    this.initialize();
  }

  async initialize() {
    await autoDisplayBanner();
    await registerAuthCreds(this);

    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;

    socket.ev.on('connection.update', (ctx) => {
      store.events.emit('connection', ctx);
    });
  }

  on<T extends z.infer<typeof EventEnumType>>(event: T, handler: EventCallbackType[T]): void {
    store.events.on(event, handler);
  }
}
