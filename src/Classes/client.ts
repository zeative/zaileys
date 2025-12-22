import makeWASocket from 'baileys';
import { JetDB } from 'jetdb';
import z from 'zod';
import { registerAuthCreds } from '../Auth';
import { ClassProxy } from '../Library/class-proxy';
import { Listener } from '../Listener';
import { store } from '../Modules/store';
import { parseZod } from '../Modules/zod';
import { Signal } from '../Signal';
import { SignalCommunity } from '../Signal/community';
import { SignalGroup } from '../Signal/group';
import { SignalNewsletter } from '../Signal/newsletter';
import { SignalPrivacy } from '../Signal/privacy';
import { ClientOptionsType, EventCallbackType, EventEnumType } from '../Types';
import { normalizeText, pickKeysFromArray } from '../Utils';
import { autoDisplayBanner } from '../Utils/banner';
import { configureFFmpeg } from '../Utils/media';
import { MessageCollector } from './collector';
import { HealthManager } from './health';
import { Logs } from './logs';
import { Middleware, MiddlewareHandler } from './middleware';
import { Plugins } from './plugins';

export interface Client extends Signal, SignalGroup, SignalPrivacy, SignalNewsletter, SignalCommunity {}

export class Client {
  private listener: Listener;
  private _ready: Promise<void>;

  health: HealthManager;
  logs: Logs;

  collector = new MessageCollector();
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

    this.listener = new Listener(client || this);

    if (!this.logs) {
      this.logs = new Logs(this);
    }

    if (this.health) {
      this.health.stop();
    }

    this.health = new HealthManager(client || this);
    this.health.start();
  }

  ready() {
    return this._ready;
  }

  db(path: string): JetDB {
    return store.db(this.options.session, path);
  }

  on<T extends z.infer<typeof EventEnumType>>(event: T, handler: EventCallbackType[T]): void {
    store.events.on(event, handler);
  }

  use<T>(handler: MiddlewareHandler<T>) {
    this.middleware.use(handler);
    return this;
  }

  get socket() {
    return store.get('socket') as ReturnType<typeof makeWASocket>;
  }

  async getRoomName(roomId: string) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    const isGroup = roomId.endsWith('@g.us');

    let roomName = null;

    if (isGroup) {
      const cached = store.groupCache.get(roomId) as any;
      if (cached) {
        roomName = cached.subject;
      } else {
        const metadata = await socket.groupMetadata(roomId);
        if (metadata) {
          store.groupCache.set(roomId, metadata);
          roomName = metadata.subject;
        }
      }
    }

    return normalizeText(roomName);
  }

  async getLabelName(roomId: string) {
    const message = await this.db('messages').get(roomId);
    const keys = pickKeysFromArray(message, ['message.protocolMessage.memberLabel']);

    return normalizeText(keys?.label) || null;
  }

  async cleanupMessages(days = 7) {
    const threshold = Date.now() - days * 24 * 60 * 60 * 1000;
    const allEntries = await this.db('messages').all();
    let deletedCount = 0;

    for (const [roomId] of allEntries) {
      const messages = await this.db('messages').get(roomId);
      if (!Array.isArray(messages)) continue;

      const filtered = messages.filter((msg) => {
        const timestamp = Number(msg.messageTimestamp) * 1000;
        if (timestamp < threshold) {
          deletedCount++;
          return false;
        }
        return true;
      });

      if (filtered.length !== messages.length) {
        await this.db('messages').set(roomId, filtered);
      }
    }

    if (deletedCount > 0 && this.options.showLogs) {
      store.spinner.info(` Cleaned up ${deletedCount} old messages`);
    }
  }
}
