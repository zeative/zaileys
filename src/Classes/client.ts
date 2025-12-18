import makeWASocket, { proto } from 'baileys';
import { JetDB } from 'jetdb';
import z from 'zod';
import { registerAuthCreds } from '../Auth';
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
import { NativeProxy } from './proxy';

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

    const proxy = new NativeProxy().classInjection(this, [
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
    this.logs = new Logs(this);

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

  async getMessageByChatId(chatId: string, media?: proto.IMessage) {
    const allEntries = await this.db('messages').all();

    for (const [roomId] of allEntries) {
      let message = await this.db('messages').query(roomId).where('key.id', '=', chatId).first();

      if (message) {
        message = {
          ...message,
          message: media,
        };

        return await this.listener.messages.parse(message);
      }
    }

    return null;
  }

  async getRoomName(roomId: string) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    const isGroup = roomId.endsWith('@g.us');

    let roomName = null;

    if (isGroup) {
      const metadata = await socket.groupMetadata(roomId);
      roomName = metadata?.subject || null;
    }

    return normalizeText(roomName);
  }

  async getLabelName(roomId: string) {
    const message = await this.db('messages').get(roomId);
    const keys = pickKeysFromArray(message, ['message.protocolMessage.memberLabel']);

    return normalizeText(keys?.label) || null;
  }
}
