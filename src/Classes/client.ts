import z from 'zod';
import { registerAuthCreds } from '../Auth';
import { parseZod } from '../Modules/zod';
import { ClientOptionsType } from '../Types';
import { autoDisplayBanner } from '../Utils/banner';
import { store } from '../Modules/store';
import makeWASocket from 'baileys';

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
      console.log(ctx);
    });
  }

  on(event: string, callback: (data: any) => void) {}
}
