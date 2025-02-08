import { Boom } from "@hapi/boom";
import makeWASocket, {
  AuthenticationState,
  Browsers,
  DisconnectReason,
  generateWAMessageFromContent,
  jidNormalizedUser,
  makeInMemoryStore,
  proto,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { parsePhoneNumber } from "awesome-phonenumber";
import chalk from "chalk";
import consola from "consola";
import { EventEmitter } from "events";
import figlet from "figlet";
import fs from "fs";
import NodeCache from "node-cache";
import ora from "ora";
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
  private spinner = ora(); // Inisialisasi spinner

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

    try {
      this.store?.readFromFile(this.config.authPath + "/memory.json");

      setInterval(() => {
        this?.store?.writeToFile(this.config.authPath + "/memory.json");
      }, 10_000);
    } catch {}

    const configKeys = Object.keys(this.config).length;
    if (configKeys) this.initialize();
  }

  protected async initialize() {
    await console.clear();

    await figlet("Zaileys Libs", function (err, data) {
      console.log(chalk.greenBright(data));
      console.log();
    });

    this?.spinner.start("Make connection to whatsapp...");

    const { state, saveCreds } = await this.authProvider;
    this.authState = {
      load: state,
      save: saveCreds,
    };

    this.socket = makeWASocket({
      logger: this.logger,
      printQRInTerminal: this.config.authType == "qr",
      markOnlineOnConnect: this.config.autoOnline,
      auth: this.authState.load,
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
        return !!messages.syncType;
      },
    });

    this.store.bind(this.socket.ev);

    if (this.config.authType == "pairing" && this.config.phoneNumber && !this.socket.authState.creds.registered) {
      if (!this.config.phoneNumber) {
        this.spinner.warn("Please enter your phone number");
        return;
      }

      if (!parsePhoneNumber("+" + this.config.phoneNumber.toString()).valid) {
        this?.spinner.warn("Please enter a valid phone number");
        return;
      }

      setTimeout(async () => {
        try {
          if (this.config.authType == "pairing") {
            const code = await this.socket.requestPairingCode(this.config.phoneNumber.toString());
            this.spinner.info("This is your OTP code: " + code.replace(/(.{4})/, "$1-"));
          }
        } catch {}
      }, 5000);
    }

    this?.socket?.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      this.emit("connection", { status: connection || "connecting" });

      if (this.config.authType == "qr" && qr) {
        this.spinner.info("Scan qrcode with your whatsapp: ");
      }

      if (connection === "close") {
        const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const isReconnect = code !== DisconnectReason.loggedOut;
        this?.spinner.fail(lastDisconnect?.error?.message);

        if (code == 401 || code == 405 || code == 500) {
          this.spinner.warn(`Bad session, please delete "${this.config.authPath}" folder and try again`);

          const isWantDeleteSession = await consola.prompt("Do you want to delete the session?", {
            type: "confirm",
          });

          if (isWantDeleteSession) {
            await this.deleteSession();
          }

          return;
        }

        if (isReconnect) this.initialize();
      } else if (connection === "open") {
        this.spinner.succeed("Successfully connected to whatsapp");
      }
    });

    this?.socket?.ev.on("creds.update", this.authState.save);

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

  private async deleteSession() {
    try {
      await fs.rmSync(`${this.config.authPath!}`, { recursive: true, force: true });
      await this.spinner.succeed("Session deleted. Please restart manually");
      process.exit(0);
    } catch {
      this?.spinner.fail("Failed to delete session");

      const isRetry = await consola.prompt("Do you want to try again?", {
        type: "confirm",
      });

      if (isRetry) return await this.deleteSession();
      process.exit(0);
    }
  }

  on<K extends keyof ClientEvents<typeof this.config.citation>>(event: K, listener: ClientEvents<typeof this.config.citation>[K]): this {
    return super.on(event, listener);
  }

  emit<K extends keyof ClientEvents<typeof this.config.citation>>(event: K, ...args: Parameters<ClientEvents<typeof this.config.citation>[K]>): boolean {
    return super.emit(event, ...args);
  }

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
    try {
      if (payload?.footer) {
        let builder = generateWAMessageFromContent(
          this?.temporaryMessage?.roomId!,
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
    } catch (error) {
      throw error;
    }
  }

  async sendReply(text: string, payload?: ReplyActionType) {
    try {
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
    } catch (error) {
      throw error;
    }
  }

  async sendImage(image: string | Buffer, payload?: SendActionType) {
    try {
      const imager = typeof image == "string" ? { image: { url: image } } : { image };

      this.socket.sendMessage(
        this?.temporaryMessage?.roomId!,
        { ...imager },
        {
          ...(payload?.asReply && { quoted: this?.temporaryMessage?.message() }),
        }
      );
    } catch (error) {
      throw error;
    }
  }

  async sendVideo(video: string | Buffer, payload?: SendActionType) {
    try {
      const videor = typeof video == "string" ? { video: { url: video } } : { video };

      this.socket.sendMessage(
        this?.temporaryMessage?.roomId!,
        { ...videor },
        {
          ...(payload?.asReply && { quoted: this?.temporaryMessage?.message() }),
        }
      );
    } catch (error) {
      throw error;
    }
  }

  async sendAudio(audio: string | Buffer, payload?: SendActionType) {
    try {
      const audior = typeof audio == "string" ? { audio: { url: audio } } : { audio };

      this.socket.sendMessage(
        this.temporaryMessage?.roomId!,
        { ...audior },
        {
          ...(payload?.asReply && { quoted: this?.temporaryMessage?.message() }),
        }
      );
    } catch (error) {
      throw error;
    }
  }

  async sendSticker(sticker: string | Buffer, payload?: SendActionType) {
    try {
      const stickerr = typeof sticker == "string" ? { sticker: { url: sticker } } : { sticker };

      this.socket.sendMessage(
        this?.temporaryMessage?.roomId!,
        { ...stickerr },
        {
          ...(payload?.asReply && { quoted: this?.temporaryMessage?.message() }),
        }
      );
    } catch (error) {
      throw error;
    }
  }
}
