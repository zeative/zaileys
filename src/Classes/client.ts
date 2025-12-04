import makeWASocket from 'baileys';
import z from 'zod';
import { registerAuthCreds } from '../Auth';
import { store } from '../Modules/store';
import { parseZod } from '../Modules/zod';
import { ClientOptionsType, EventCallbackType, EventEnumType } from '../Types';
import { autoDisplayBanner } from '../Utils/banner';
import { Listener } from '../Listener';

import { Middleware, MiddlewareHandler } from './middleware';

export class Client {
  middleware = new Middleware<any>();

  constructor(public options: z.infer<typeof ClientOptionsType>) {
    this.options = parseZod(ClientOptionsType, options);
    this.initialize();
  }

  async initialize() {
    await autoDisplayBanner();
    await registerAuthCreds(this);

    new Listener(this);
  }

  db(path: string) {
    return store.lowdb(this.options.session, `stores/${path}.json`);
  }

  on<T extends z.infer<typeof EventEnumType>>(event: T, handler: EventCallbackType[T]): void {
    store.events.on(event, handler);
  }

  use<T>(handler: MiddlewareHandler<T>) {
    this.middleware.use(handler);
    return this;
  }
}
