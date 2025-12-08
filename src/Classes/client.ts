import z from 'zod';
import { registerAuthCreds } from '../Auth';
import { Listener } from '../Listener';
import { store } from '../Modules/store';
import { parseZod } from '../Modules/zod';
import { Signal } from '../Signal';
import { SignalGroup } from '../Signal/group';
import { ClientOptionsType, EventCallbackType, EventEnumType } from '../Types';
import { normalizeText, pickKeysFromArray } from '../Utils';
import { autoDisplayBanner } from '../Utils/banner';
import { MessageCollector } from './collector';
import { Logs } from './logs';
import { Middleware, MiddlewareHandler } from './middleware';
import { Plugins } from './plugins';
import { NativeProxy } from './proxy';

export interface Client extends Signal, SignalGroup {}

export class Client {
  private listener: Listener;
  private _ready: Promise<void>;

  logs: Logs;

  collector = new MessageCollector();
  middleware = new Middleware<any>();
  plugins = new Plugins();

  constructor(public options: z.infer<typeof ClientOptionsType>) {
    this.options = parseZod(ClientOptionsType, options);
    this._ready = this.initialize();

    return new NativeProxy().classInjection(this, [new Signal(this), new SignalGroup(this)]);
  }

  async initialize() {
    await autoDisplayBanner();
    await registerAuthCreds(this);

    await this.plugins.load();

    this.listener = new Listener(this);
    this.logs = new Logs(this);
  }

  ready() {
    return this._ready;
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

  async getMessageByChatId(chatId: string) {
    const messages = await this.db('messages').all();
    const message = messages
      ?.flat()
      ?.filter((x) => typeof x === 'object')
      ?.flat()
      ?.find((x) => x?.key?.id === chatId);

    return await this.listener.messages.parse(message);
  }

  async getRoomName(roomId: string) {
    const chat = await this.db('chats').get(roomId);
    const contact = await this.db('contacts').get(roomId);

    const chatName = pickKeysFromArray(chat, ['name', 'verifiedName']);
    const contactName = pickKeysFromArray(contact, ['notify', 'name']);

    return normalizeText(chatName || contactName) || null;
  }
}
