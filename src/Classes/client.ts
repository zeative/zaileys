import makeWASocket from 'baileys';
import z from 'zod';
import { registerAuthCreds } from '../Auth';
import { store } from '../Modules/store';
import { parseZod } from '../Modules/zod';
import { ClientOptionsType, EventCallbackType, EventEnumType } from '../Types';
import { autoDisplayBanner } from '../Utils/banner';
import { Listener } from '../Listener';

export class Client {
  constructor(public options: z.infer<typeof ClientOptionsType>) {
    this.options = parseZod(ClientOptionsType, options);
    this.initialize();
  }

  async initialize() {
    await autoDisplayBanner();
    await registerAuthCreds(this);

    new Listener(this);
  }

  on<T extends z.infer<typeof EventEnumType>>(event: T, handler: EventCallbackType[T]): void {
    store.events.on(event, handler);
  }
}
