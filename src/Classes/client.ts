import makeWASocket from 'baileys';
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
import { getDeepContent, normalizeText, pickKeysFromArray } from '../Utils';
import { autoDisplayBanner } from '../Utils/banner';
import { configureFFmpeg } from '../Utils/media';
import { createWatchdog, SessionWatchdog } from '../Utils/watchdog';
import { MessageCollector } from './collector';
import { Logs } from './logs';
import { Middleware, MiddlewareHandler } from './middleware';
import { Plugins } from './plugins';
import { NativeProxy } from './proxy';

export interface Client extends Signal, SignalGroup, SignalPrivacy, SignalNewsletter, SignalCommunity {}

export class Client {
  private listener: Listener;
  private _ready: Promise<void>;
  private watchdog: SessionWatchdog | null = null;

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

    this.watchdog = createWatchdog({
      session: this.options.session,
      checkIntervalMs: 60_000,
      staleThresholdMs: 120_000,
      cooldownMs: 60_000,
      maxRetries: 3,

      onRecovery: async () => {
        await this.initialize(client);
      },
    });

    this.watchdog.start();
    this.setupPrekeyErrorDetection();
  }

  private prekeyDetected = false;
  private setupPrekeyErrorDetection() {
    const originalLog = console.log;
    const watchdog = this.watchdog;
    const self = this;

    console.log = (...args: unknown[]) => {
      const message = args
        .map((a) => String(a))
        .join(' ')
        .toLowerCase();
      if ((message.includes('closing open session') || message.includes('prekey bundle')) && !self.prekeyDetected) {
        self.prekeyDetected = true;
        store.spinner.warn(' Prekey bundle error detected');
        watchdog?.forceRecovery();
        setTimeout(() => {
          self.prekeyDetected = false;
        }, 60_000);
      }
      return originalLog.apply(console, args);
    };
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

  async getMessageByChatId(chatId: string) {
    const allEntries = await this.db('messages').all();

    // Search through each room's messages efficiently
    for (const [roomId] of allEntries) {
      const message = await this.db('messages').query(roomId).where('key.id', '=', chatId).first();

      if (message) {
        return await this.listener.messages.parse(message);
      }
    }

    return null;
  }

  async getRoomName(roomId: string) {
    const chat = await this.db('chats').get(roomId);
    const contact = await this.db('contacts').query('all-contacts').all();
    console.log('🔍 ~ getRoomName ~ src/Classes/client.ts:139 ~ contact:', contact);

    // const chatName = pickKeysFromArray(chat, ['name', 'verifiedName']);
    // const contactName = pickKeysFromArray(contact, ['notify', 'name']);

    // return normalizeText(chatName || contactName) || null;
  }

  async getLabelName(roomId: string) {
    const message = await this.db('messages').get(roomId);
    const keys = pickKeysFromArray(message, ['message.protocolMessage.memberLabel']);

    return normalizeText(keys?.label) || null;
  }
}
