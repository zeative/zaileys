import makeWASocket, { Browsers, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } from "baileys";
import { EventEmitter } from "events";
import figlet from "figlet";
import { Kysely } from "kysely";
import NodeCache from "node-cache";
import ora, { Ora } from "ora";
import pino from "pino";
import { z } from "zod";
import { AuthAdapterHandler, ConnectDB, StoreAdapterHandler } from "../database/handler";
import { DB } from "../database/schema";
import { toJson } from "../helpers/utils";
import { ClientClassesType } from "../types/classes/client";
import { EventCallbackType, EventEnumType } from "../types/classes/event";
import Worker from "./Worker";

const displayBanner = (text: string = "ZAILEYS"): Promise<string> => {
  return new Promise((resolve) => {
    figlet(text, (err, data) => {
      if (err) return resolve("");
      console.log(data);
      resolve(data || "");
    });
  });
};

export class Client {
  options: z.infer<typeof ClientClassesType> = {} as never;
  cache: NodeCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });

  private chatId: string = "zaileys-chats";
  private logger: pino.Logger = pino({ level: "silent", enabled: false });
  private db: Kysely<DB> | undefined;
  private socket: ReturnType<typeof makeWASocket> | undefined;
  private events: EventEmitter = new EventEmitter();
  private spinners: Map<string, Ora> = new Map();
  private worker: Worker | undefined;

  constructor(private props: z.input<typeof ClientClassesType>) {
    this.initialize();
    this.worker;

    return new Proxy(this, {
      get(target, prop) {
        if (prop in target) return target[prop as never];
        return target.worker![prop as never];
      },
    });
  }

  async initialize() {
    console.clear();
    await displayBanner();

    this.options = await ClientClassesType.parseAsync(this.props);

    this.startSpinner("db", "Initializing database...");
    this.db = ConnectDB(this.options.database.type, this.options.database.connection.url);
    this.stopSpinner("db", true, "Database initialized");

    this.startSpinner("auth", "Setting up auth adapter...");
    const { state, saveCreds } = await AuthAdapterHandler(this.db, this.chatId);
    this.stopSpinner("auth", true, "Auth adapter ready");

    this.startSpinner("store", "Setting up store adapter...");
    const store = await StoreAdapterHandler(this, this.db, this.chatId);
    this.stopSpinner("store", true, "Store adapter ready");

    const { version } = await fetchLatestBaileysVersion();

    this.socket = makeWASocket({
      version,
      logger: this.logger,
      markOnlineOnConnect: this.options.autoOnline,
      syncFullHistory: false,
      defaultQueryTimeoutMs: undefined,
      msgRetryCounterCache: new NodeCache(),
      mediaCache: new NodeCache({ stdTTL: 60 }),
      userDevicesCache: new NodeCache(),
      cachedGroupMetadata: async (jid: string) => this.cache.get(jid),
      printQRInTerminal: this.options.authType === "qr",
      browser: Browsers.ubuntu(this.options.authType === "qr" ? "Zaileys Library" : "Chrome"),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, this.logger),
      },
      getMessage: async (key) => {
        const message = await this.db?.selectFrom("messages").select("value").where("id", "=", key.id!).executeTakeFirst();
        return toJson(message?.value!);
      },
    });

    if (this.options.authType === "pairing" && this.options.phoneNumber && !this.socket?.authState.creds.registered) {
      this.startSpinner("pairing", "Generating pairing code...");

      const result = await this.socket.onWhatsApp(this.options.phoneNumber.toString() + "@s.whatsapp.net");
      if (!result![0].exists) {
        this.failSpinner("pairing", "Phone is not registered in WhatsApp");
        process.exit(1);
      }

      setTimeout(async () => {
        try {
          if (this.options?.authType === "pairing") {
            const code = await this.socket?.requestPairingCode(this.options.phoneNumber.toString());
            this.stopSpinner("pairing", true, `Pairing code: ${code}`);
          }
        } catch {
          this.failSpinner("pairing", "Connection failed");
          process.exit(1);
        }
      }, 5000);
    }

    this.worker = new Worker({ client: this, db: this.db!, socket: this.socket });
    this.socket?.ev.on("creds.update", saveCreds);
    store.bind(this.socket);
  }

  startSpinner(key: string, message: string): Ora {
    let spinner = this.spinners.get(key);
    if (!spinner) {
      spinner = ora(message).start();
      this.spinners.set(key, spinner);
    }
    return spinner;
  }

  stopSpinner(key: string, succeed: boolean, message?: string): void {
    const spinner = this.spinners.get(key);
    if (spinner) {
      if (succeed) {
        spinner.succeed(message);
      } else {
        spinner.stop();
      }
      this.spinners.delete(key);
    }
  }

  failSpinner(key: string, message?: string): void {
    const spinner = this.spinners.get(key);
    if (spinner) {
      spinner.fail(message);
      this.spinners.delete(key);
    }
  }

  on<T extends EventEnumType>(event: T, handler: EventCallbackType[T]): void {
    this.events.on(event, handler);
  }

  emit<T extends EventEnumType>(event: T, ...args: Parameters<EventCallbackType[T]>): void {
    this.events.emit(event, ...args);
  }
}

export default Client;
export interface Client extends Worker {}
