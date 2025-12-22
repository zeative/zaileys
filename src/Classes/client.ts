import makeWASocket from 'baileys';
import { JetDB } from 'jetdb';
import z from 'zod';
import { registerAuthCreds } from '../Auth';
import { groupCache } from '../Config/cache';
import { WaDatabase } from '../Config/database';
import { store } from '../Library/center-store';
import { ClassProxy } from '../Library/class-proxy';
import { parseZod } from '../Library/zod';
import { Listener } from '../Listener';
import { Signal } from '../Signal';
import { SignalCommunity } from '../Signal/community';
import { SignalGroup } from '../Signal/group';
import { SignalNewsletter } from '../Signal/newsletter';
import { SignalPrivacy } from '../Signal/privacy';
import { ClientOptionsType, EventCallbackType, EventEnumType } from '../Types';
import { normalizeText } from '../Utils';
import { autoDisplayBanner } from '../Utils/banner';
import { configureFFmpeg } from '../Utils/media';
import { Logs } from './logs';
import { Middleware, MiddlewareHandler } from './middleware';
import { Plugins } from './plugins';

export interface Client extends Signal, SignalGroup, SignalPrivacy, SignalNewsletter, SignalCommunity {}

export class Client {
  private _ready: Promise<void>;

  logs: Logs;

  middleware = new Middleware<any>();
  plugins = new Plugins();

  constructor(public options: z.infer<typeof ClientOptionsType>) {
    this.options = parseZod(ClientOptionsType, options);

    const proxy = new ClassProxy().classInjection(this, [
      new Signal(this),
      new SignalGroup(this),
      new SignalPrivacy(this),
      new SignalNewsletter(this),
      new SignalCommunity(this),
    ]);

    this._ready = this.initialize(proxy);
    return proxy;
  }

  async initialize(client?: Client) {
    await autoDisplayBanner();
    await configureFFmpeg(this.options.disableFFmpeg);
    await registerAuthCreds(this);

    await this.plugins.load();

    new Listener(client || this);

    if (!this.logs) {
      this.logs = new Logs(this);
    }
  }

  ready() {
    return this._ready;
  }

  db(scope: string): JetDB {
    return WaDatabase(this.options.session, scope);
  }

  on<T extends z.infer<typeof EventEnumType>>(event: T, handler: EventCallbackType[T]): void {
    store.events.on(event, handler);
  }

  use<T>(handler: MiddlewareHandler<T>) {
    this.middleware.use(handler);
    return this;
  }

  get socket(): ReturnType<typeof makeWASocket> {
    return store.get('socket');
  }

  async getRoomName(roomId: string) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    const isGroup = roomId.endsWith('@g.us');

    let roomName = null;

    if (isGroup) {
      const cached = groupCache.get(roomId) as any;

      if (cached) {
        roomName = cached.subject;
      } else {
        const metadata = await socket.groupMetadata(roomId);

        if (metadata) {
          groupCache.set(roomId, metadata);
          roomName = metadata.subject;
        }
      }
    }

    return normalizeText(roomName);
  }
}
