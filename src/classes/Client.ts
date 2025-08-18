import makeWASocket, {
  Browsers,
  delay,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "baileys";
import EventEmitter from "events";
import { createSpinner } from "nanospinner";
import NodeCache from "node-cache";
import pino from "pino";
import { CredsHandler } from "../modules/database";
import {
  ClientOptionsType,
  EventCallbackType,
  EventEnumType,
} from "../types/classes/Client";
import { ExtractZod } from "../types/general";
import { displayBanner } from "../utils/banner";
import { shuffleString } from "../utils/helpers";
import { Listener } from "./Listener";
import { Relay } from "./Relay";

export class Client {
  public props: ExtractZod<typeof ClientOptionsType>;

  private logger: pino.Logger = pino({ level: "silent", enabled: false });
  private events: EventEmitter = new EventEmitter();
  private relay: Relay;
  private retryCount: number = 0;
  private maxRetries: number = 10;
  private connectionTimeout: NodeJS.Timeout | undefined;

  spinner = createSpinner("", { color: "green" });
  socket: ReturnType<typeof makeWASocket> | undefined;
  cache: NodeCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });

  constructor(props: ExtractZod<typeof ClientOptionsType>) {
    this.props = ClientOptionsType.parse(props);
    this.initialize();

    return new Proxy(this, {
      get(target, prop) {
        if (prop in target) return target[prop];
        return target.relay[prop];
      },
    });
  }

  async initialize() {
    console.clear();
    await displayBanner();

    await delay(1000);
    await this.spinner.start("Initializing database...");
    const { db, state, store, saveCreds } = await CredsHandler(this.props);

    await this.spinner.start("Fetching newest version...");
    const { version } = await fetchLatestBaileysVersion();

    this.socket = makeWASocket({
      version,
      logger: this.logger,
      markOnlineOnConnect: this.props.autoOnline,
      syncFullHistory: true,
      printQRInTerminal: false,
      defaultQueryTimeoutMs: undefined,
      msgRetryCounterCache: new NodeCache(),
      mediaCache: new NodeCache({ stdTTL: 60 }),
      userDevicesCache: new NodeCache(),
      cachedGroupMetadata: async (jid: string) => this.cache.get(jid),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, this.logger),
      },
      getMessage: async (key) => {
        const message = await db.store("messages").read(key.id);
        return message;
      },
    });

    await this.socket?.ev.on("creds.update", saveCreds);

    if (
      this.props.authType === "pairing" &&
      this.props.phoneNumber &&
      !this.socket?.authState.creds.registered
    ) {
      this.spinner.start("Generating pairing code...");

      setTimeout(async () => {
        try {
          if (this.props?.authType === "pairing") {
            const code = await this.socket?.requestPairingCode(
              this.props.phoneNumber.toString(),
              shuffleString("Z4D3V0FC")
            );
            this.spinner.info(`Pairing code: ${code}`);
          }
        } catch {
          this.spinner.error(
            `Session "${this.props.session}" has not valid, please delete it`
          );
          process.exit(0);
        }
      }, 5000);
    }

    const listener = new Listener();
    this.relay = new Relay();
    this.spinner.success("Initialize Successfully");

    await store.bind(this);
    await listener.bind(this);
    await this.relay.bind(this);

    this.spinner.start("Connecting to WhatsApp...");
    this.startConnectionTimeout();
  }

  private startConnectionTimeout() {
    // Clear existing timeout
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
    }

    // Set 30 second timeout for connection
    this.connectionTimeout = setTimeout(() => {
      this.handleConnectionTimeout();
    },60000);
  }

  private handleConnectionTimeout() {
    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      this.spinner.warn(`Connection timeout. Retrying... (${this.retryCount}/${this.maxRetries})`);
      this.autoReload();
    } else {
      this.spinner.error(`Max retries reached (${this.maxRetries}). Connection failed.`);
      process.exit(1);
    }
  }

  private async autoReload() {
    try {
      // Clear existing timeout
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
      }

      // Close existing socket if exists
      if (this.socket) {
        this.socket.end();
        this.socket = undefined;
      }

      // Wait a bit before retrying
      await delay(2000);

      // Reinitialize connection
      await this.initialize();
    } catch (error) {
      this.spinner.error(`Auto-reload failed: ${error.message}`);
      this.handleConnectionTimeout();
    }
  }

  public resetRetryCount() {
    this.retryCount = 0;
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
    }
  }

  on<T extends ExtractZod<typeof EventEnumType>>(
    event: T,
    handler: EventCallbackType[T]
  ): void {
    this.events.on(event, handler);
  }

  emit<T extends ExtractZod<typeof EventEnumType>>(
    event: T,
    ...args: Parameters<EventCallbackType[T]>
  ): void {
    this.events.emit(event, ...args);
  }
}

export interface Client extends Relay {}
export default Client;
