import makeWASocket from "baileys";
import { JetDB } from "jetdb";
import z from "zod";
import { registerAuthCreds } from "../Auth";
import { groupCache } from "../Config/cache";
import { WaDatabase } from "../Config/database";
import { store } from "../Library/center-store";
import { ClassProxy } from "../Library/class-proxy";
import { CleanUpManager } from "../Library/cleanup-manager";
import { contextInjection } from "../Library/context-injection";
import { initializeFFmpeg } from "../Library/ffmpeg";
import { HealthManager } from "../Library/health-manager";
import { parseZod } from "../Library/zod";
import { Listener } from "../Listener";
import { Signal } from "../Signal";
import { SignalCommunity } from "../Signal/community";
import { SignalGroup } from "../Signal/group";
import { SignalNewsletter } from "../Signal/newsletter";
import { SignalPrivacy } from "../Signal/privacy";
import { ClientOptionsType, EventCallbackType, EventEnumType } from "../Types";
import { normalizeText } from "../Utils";
import { Logs } from "./logs";
import { Middleware, MiddlewareHandler } from "./middleware";
import { Plugins } from "./plugins";
import { SpinnerManager } from "../Library/spinner-manager";

export interface Client
  extends Signal,
    SignalGroup,
    SignalPrivacy,
    SignalNewsletter,
    SignalCommunity {}

export class Client {
  private _ready: Promise<void>;

  logs: Logs;

  middleware = new Middleware<any>();
  plugins: Plugins;
  health: HealthManager;
  cleanup: CleanUpManager;

  constructor(public options: z.infer<typeof ClientOptionsType>) {
    this.options = parseZod(ClientOptionsType, options);

    const proxy = new ClassProxy().classInjection(this, [
      new Signal(this),
      new SignalGroup(this),
      new SignalPrivacy(this),
      new SignalNewsletter(this),
      new SignalCommunity(this),
    ]);

    this.plugins = new Plugins(
      this.options.pluginsDir,
      this.options.pluginsHmr,
    );

    this._ready = this.initialize(proxy);
    return proxy;
  }

  async initialize(client?: Client) {
    store.spinner = new SpinnerManager(this.options.showSpinner !== false);

    await initializeFFmpeg(this.options.disableFFmpeg);

    this.health = new HealthManager(this);
    this.cleanup = new CleanUpManager(this);

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
  }

  ready() {
    return this._ready;
  }

  db(scope: string): JetDB {
    return WaDatabase(this.options.session, scope);
  }

  on<T extends z.infer<typeof EventEnumType>>(
    event: T,
    handler: EventCallbackType[T],
  ): void {
    store.events.on(event, handler);
  }

  use<T>(handler: MiddlewareHandler<T>) {
    this.middleware.use(handler);
    return this;
  }

  get socket(): ReturnType<typeof makeWASocket> {
    return store.get("socket");
  }

  async getRoomName(roomId: string) {
    const socket = store.get("socket") as ReturnType<typeof makeWASocket>;
    const isGroup = roomId.endsWith("@g.us");

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
