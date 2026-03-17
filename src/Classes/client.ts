import makeWASocket from 'baileys';
import { RootDatabase } from 'lmdb';
import * as v from 'valibot';
import { registerAuthCreds } from '../Auth';
import { groupCache } from '../Config/cache';
import { WaDatabase } from '../Config/database';
import { store } from '../Library/center-store';
import { ClassProxy } from '../Library/class-proxy';
import { CleanUpManager } from '../Library/cleanup-manager';
import { contextInjection } from '../Library/context-injection';
import { fireForget } from '../Library/fire-forget';
import { initializeFFmpeg } from '@zaadevofc/media-process';
import { HealthManager } from '../Library/health-manager';
import { parseValibot } from '../Library/valibot';
import { Listener } from '../Listener';
import { Signal } from '../Signal';
import { SignalCommunity } from '../Signal/community';
import { SignalGroup } from '../Signal/group';
import { SignalNewsletter } from '../Signal/newsletter';
import { SignalPrivacy } from '../Signal/privacy';
import { ClientOptionsType, EventCallbackType, EventEnumType } from '../Types';
import { normalizeText } from '../Utils';
import { autoDisplayBanner } from '../Utils/banner';
import { Logs } from './logs';
import { Middleware, MiddlewareHandler } from './middleware';
import { Plugins } from './plugins';

export interface Client extends Signal, SignalGroup, SignalPrivacy, SignalNewsletter, SignalCommunity { }

export class Client {
  private _ready: Promise<void>;

  logs: Logs;

  middleware = new Middleware<any>();
  plugins: Plugins;
  health: HealthManager;
  cleanup: CleanUpManager;

  public options: v.InferOutput<typeof ClientOptionsType>;

  constructor(options: v.InferInput<typeof ClientOptionsType>) {
    this.options = parseValibot(ClientOptionsType, options);

    const proxy = new ClassProxy().classInjection(this, [
      new Signal(this),
      new SignalGroup(this),
      new SignalPrivacy(this),
      new SignalNewsletter(this),
      new SignalCommunity(this),
    ]);

    this.plugins = new Plugins(this.options.pluginsDir, this.options.pluginsHmr);

    this._ready = this.initialize(proxy);
    return proxy;
  }

  async initialize(client?: Client) {
    await autoDisplayBanner();
    await initializeFFmpeg(this.options.disableFFmpeg);

    this.plugins = new Plugins(this.options.pluginsDir, this.options.pluginsHmr);

    const originalInfo = console.info;
    console.info = (...args: any[]) => {
      const isLibsignalSpam = args.some(arg =>
        typeof arg === 'string' && (arg.includes('Closing session:') || arg.includes('Opening session:'))
      );

      if (isLibsignalSpam) {
        if (this.options.showLogs) {
          store.spinner.info('Encryption session rotated securely.');
        }
        return;
      }
      originalInfo(...args);
    };

    this.health = new HealthManager(this);
    this.cleanup = new CleanUpManager(this);

    if (!this.options.showSpinner) {
      store.spinner = new Proxy(store.spinner, {
        get: (target, prop) => (typeof target[prop as keyof typeof target] === 'function' ? () => target : target[prop as keyof typeof target]),
      });
    }

    if (this.options.autoCleanUp?.enabled) {
      this.cleanup.start();
    }

    await registerAuthCreds(this);

    await this.plugins.load();
    this.plugins.setupHmr();

    new Listener(client || this);

    if (!this.logs) {
      this.logs = new Logs(this);
    }

    const cleanup = async (code: any) => {
      try {
        if (this.socket) {
          this.socket.end(new Error('Process Terminated'));
        }
        await fireForget.close(5000); 
      } catch {
        // Safe exit
      }
      process.exit();
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('uncaughtException', (err) => {
      console.error("FATAL UNCAUGHT:", err);
      cleanup('UNCAUGHT');
    });
  }

  ready() {
    return this._ready;
  }

  db(scope: string): RootDatabase {
    return WaDatabase(this.options.session, scope);
  }

  on<T extends v.InferOutput<typeof EventEnumType>>(event: T, handler: EventCallbackType[T]): void {
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

  inject<T = any>(key: string, value: T): void {
    contextInjection.inject(key, value);
  }

  getInjection<T = any>(key: string): T | undefined {
    return contextInjection.getSync<T>(key);
  }

  removeInjection(key: string): void {
    contextInjection.remove(key);
  }

  clearInjections(): void {
    contextInjection.clear();
  }
}
