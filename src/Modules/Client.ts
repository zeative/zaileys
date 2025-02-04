import { Boom } from "@hapi/boom";
import makeWASocket, {
  AuthenticationState,
  Browsers,
  DisconnectReason,
  generateWAMessageFromContent,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  makeInMemoryStore,
  proto,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { parsePhoneNumber } from "awesome-phonenumber";
import consola from "consola";
import { EventEmitter } from "events";
import NodeCache from "node-cache";
import pino from "pino";
import { MessageParser } from "../Parser/Message";
import { FakeVerifiedEnum, ReplyActionType, SendActionType } from "../Types/Action";
import { ClientConfig, ClientEvents } from "../Types/General";
import { MessageBaseContent } from "../Types/Message";
import { VERIFIED_PLATFORM } from "./Config";

export class Client extends EventEmitter {
  private config: ClientConfig;

  private authState: { load: AuthenticationState; save: () => Promise<void> };
  private authProvider: ReturnType<typeof useMultiFileAuthState>;

  private socket: ReturnType<typeof makeWASocket>;
  private store: ReturnType<typeof makeInMemoryStore>;

  private groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });
  private logger = pino({ level: "silent", enabled: false }) as never;

  protected temporaryMessage: MessageBaseContent<any> | null;
  protected parseMention: string[];

  constructor(config: ClientConfig) {
    super();

    this.config = config;
    this.config.showLogs = !!this.config.showLogs;
    this.config.autoOnline = !!this.config.autoOnline;
    this.config.authPath = this.config.authPath || ".zaileys";
    this.config.ignoreMe = this.config.ignoreMe == undefined ? true : this.config.ignoreMe;
    this.config.showLogs = this.config.showLogs == undefined ? true : this.config.showLogs;

    this.authProvider = useMultiFileAuthState(this.config.authPath + "/session");
    this.store = makeInMemoryStore({ logger: this.logger });
    this.store?.readFromFile(this.config.authPath + "/memory.json");

    setInterval(() => {
      this.store?.writeToFile(this.config.authPath + "/memory.json");
    }, 10_000);

    const configKeys = Object.keys(this.config).length;
    if (configKeys) this.initialize();
  }

  protected async initialize() {
    console.clear();

    const { state, saveCreds } = await this.authProvider;
    this.authState = {
      load: state,
      save: saveCreds,
    };

    this.socket = makeWASocket({
      logger: this.logger,
      printQRInTerminal: this.config.authType == "qr",
      markOnlineOnConnect: this.config.autoOnline,
      auth: { creds: this.authState.load.creds!, keys: makeCacheableSignalKeyStore(this.authState.load.keys!, this.logger) },
      version: [2, 3000, 1017531287],
      syncFullHistory: true,
      msgRetryCounterCache: new NodeCache(),
      browser: Browsers.ubuntu(this.config.authType == "qr" ? "Zaileys Library" : "Firefox"),
      cachedGroupMetadata: async (jid) => this.groupCache.get(jid),
      getMessage: async (key) => {
        if (this.store) {
          const msg = await this.store.loadMessage(key.remoteJid!, key.id!);
          return msg?.message || undefined;
        }
        return proto.Message.fromObject({});
      },
      shouldSyncHistoryMessage: (messages) => {
        consola.warn(`Syncing message: ${messages.chunkOrder} ${messages.progress}%`);
        return !!messages.syncType;
      },
    });

    this.store.bind(this.socket.ev);

    if (this.config.authType == "pairing" && this.config.phoneNumber && !this.socket.authState.creds.registered) {
      if (!this.config.phoneNumber) {
        consola.warn("Nomor nya mana woe!");
        return;
      }

      if (!parsePhoneNumber("+" + this.config.phoneNumber.toString()).valid) {
        consola.warn("Nomor ga valid woe!");
        return;
      }

      setTimeout(async () => {
        if (this.config.authType == "pairing") {
          const code = await this.socket.requestPairingCode(this.config.phoneNumber.toString());
          consola.info("Nih kode nya: " + code);
        }
      }, 5000);
    }

    this.socket?.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      this.emit("connection", { status: connection || "connecting" });

      if (this.config.authType == "qr" && qr) {
        consola.info("Nih bro qr nya: ");
      }

      if (connection === "close") {
        const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const isReconnect = code !== DisconnectReason.loggedOut;
        consola.error(code, lastDisconnect?.error?.message);

        if (code == 401 || code == 405 || code == 500) {
          consola.warn(`Bad session, please delete "${this.config.authPath}" folder and try again`);
          process.exit(1);
        }

        if (isReconnect) this.initialize();
      } else if (connection === "open") {
        consola.success("Opened connection");
      }
    });

    this.socket?.ev.on("creds.update", this.authState.save);

    this.socket.ev.on("contacts.update", (update) => {
      for (let contact of update) {
        let id = jidNormalizedUser(contact.id);
        if (this.store && this.store.contacts) this.store.contacts[id] = { ...(this.store.contacts?.[id] || {}), ...(contact || {}) };
      }
    });
    this.socket.ev.on("contacts.upsert", (update) => {
      for (let contact of update) {
        let id = jidNormalizedUser(contact.id);
        if (this.store && this.store.contacts) this.store.contacts[id] = { ...(contact || {}) };
      }
    });

    this.socket?.ev.on("messages.upsert", async (upsert) => {
      const messages = upsert.messages;

      for (const msg of messages) {
        if (this.config.ignoreMe && msg.key.fromMe) continue;

        const provider = new MessageParser({ message: msg, socket: this.socket, config: this.config, store: this.store });
        const handle = await provider.handle();

        if (handle) {
          if (this.config.autoRead) {
            await this.socket.readMessages([handle.key()]);
          }

          this.temporaryMessage = handle;

          if (this.config.autoMentions) {
            this.parseMention = handle.mentions!;
          }

          this.emit("message", handle);
        }
      }
    });

    this.socket.ev.on("groups.update", async ([event]) => {
      const metadata = await this.socket.groupMetadata(event.id!);
      this.groupCache.set(event.id!, metadata);
    });

    this.socket.ev.on("group-participants.update", async (event) => {
      const metadata = await this.socket.groupMetadata(event.id);
      this.groupCache.set(event.id, metadata);
    });

    this.socket.ev.on("call", async (caller) => {
      for (const call of caller) {
        if (this.config.autoRejectCall) {
          await this.socket.rejectCall(call.id, call.from);
        }
      }
    });
  }

  on<K extends keyof ClientEvents<typeof this.config.citation>>(event: K, listener: ClientEvents<typeof this.config.citation>[K]): this {
    return super.on(event, listener);
  }

  emit<K extends keyof ClientEvents<typeof this.config.citation>>(event: K, ...args: Parameters<ClientEvents<typeof this.config.citation>[K]>): boolean {
    return super.emit(event, ...args);
  }

  // async sendText(text: string) {
  //   this.socket.sendMessage(this?.temporaryMessage?.roomId!, { text });
  // }

  protected generateMentions(mentions: string[]) {
    const tags = ["@s.whatsapp.net", "@g.us", "@newsletter"];
    const mentioned: string[] = [];

    mentions?.forEach((x) => {
      tags.forEach((y) => {
        mentioned.push(x.slice(1) + y);
      });
    });

    return mentioned;
  }

  protected generateFakeVerified(key: proto.IMessageKey, platform: FakeVerifiedEnum) {
    return { ...key, participant: VERIFIED_PLATFORM[platform] };
  }

  async sendText(text: string, payload?: ReplyActionType) {
    if (payload?.footer) {
      let builder = generateWAMessageFromContent(
        this.temporaryMessage?.roomId!,
        {
          interactiveMessage: {
            contextInfo: { mentionedJid: this.generateMentions(this.parseMention) },
            body: {
              text,
            },
            footer: {
              text: payload?.footer!,
            },
            nativeFlowMessage: {},
          },
        },
        { userJid: this?.temporaryMessage?.roomId! }
      );
      await this.socket.relayMessage(builder.key.remoteJid!, builder.message!, { messageId: builder.key.id! });
    } else {
      await this.socket.sendMessage(this.temporaryMessage?.roomId!, { text });
    }
  }

  async sendReply(text: string, payload?: ReplyActionType) {
    if (payload?.footer) {
      let builder = generateWAMessageFromContent(
        this.temporaryMessage?.roomId!,
        {
          interactiveMessage: {
            contextInfo: { mentionedJid: this.generateMentions(this.parseMention) },
            body: {
              text,
            },
            footer: {
              text: payload?.footer!,
            },
            nativeFlowMessage: {},
          },
        },
        { quoted: { ...this.temporaryMessage?.message()!, key: this.generateFakeVerified(this?.temporaryMessage?.message()!.key!, payload.fakeVerified!) }, userJid: this?.temporaryMessage?.roomId! }
      );

      await this.socket.relayMessage(builder.key.remoteJid!, builder.message!, { messageId: builder.key.id! });
    } else {
      await this.socket.sendMessage(
        this.temporaryMessage?.roomId!,
        { text },
        { quoted: { ...this?.temporaryMessage?.message()!, key: this.generateFakeVerified(this?.temporaryMessage?.message()!.key!, payload?.fakeVerified!) } }
      );
    }
  }

  async sendImage(image: string | Buffer, payload?: SendActionType) {
    const imager = typeof image == "string" ? { image: { url: image } } : { image };

    this.socket.sendMessage(
      this?.temporaryMessage?.roomId!,
      { ...imager },
      {
        ...(payload?.asReply && { quoted: this?.temporaryMessage?.message() }),
      }
    );
  }

  async sendVideo(video: string | Buffer, payload?: SendActionType) {
    const videor = typeof video == "string" ? { video: { url: video } } : { video };

    this.socket.sendMessage(
      this?.temporaryMessage?.roomId!,
      { ...videor },
      {
        ...(payload?.asReply && { quoted: this?.temporaryMessage?.message() }),
      }
    );
  }

  async sendAudio(audio: string | Buffer, payload?: SendActionType) {
    const audior = typeof audio == "string" ? { audio: { url: audio } } : { audio };

    this.socket.sendMessage(
      this.temporaryMessage?.roomId!,
      { ...audior },
      {
        ...(payload?.asReply && { quoted: this?.temporaryMessage?.message() }),
      }
    );
  }

  async sendSticker(sticker: string | Buffer, payload?: SendActionType) {
    const stickerr = typeof sticker == "string" ? { sticker: { url: sticker } } : { sticker };

    this.socket.sendMessage(
      this.temporaryMessage?.roomId!,
      { ...stickerr },
      {
        ...(payload?.asReply && { quoted: this?.temporaryMessage?.message() }),
      }
    );
  }
}
