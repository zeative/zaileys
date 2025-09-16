import makeWASocket, { BufferJSON, delay, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, DisconnectReason, jidNormalizedUser, initAuthCreds, getContentType, downloadMediaMessage } from 'baileys';
import EventEmitter from 'events';
import { createSpinner } from 'nanospinner';
import NodeCache2 from 'node-cache';
import pino from 'pino';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'fs';
import lowdb from 'lowdb';
import FileSync from 'lowdb/adapters/FileSync';
import { dirname } from 'path';
import chalk from 'chalk';
import z3, { z as z$1 } from 'zod/v4';
import { z } from 'zod';
import figlet from 'figlet';
import QRCode from 'qrcode';
import _ from 'lodash';
import Bottleneck from 'bottleneck';

// src/classes/Client.ts
var sendError = (text) => new Error(chalk.red(text));

// src/utils/helpers.ts
var toJson = (object) => {
  try {
    return JSON.parse(object);
  } catch {
    return JSON.parse(JSON.stringify(object) || "{}");
  }
};
var toString = (object) => {
  try {
    return JSON.stringify(object);
  } catch {
    return JSON.stringify(toJson(object) || {});
  }
};
var shuffleString = (str) => {
  const arr = [...str];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join("");
};
var tryAgain = async (fn) => {
  const RETRY_DELAY = 200;
  const MAX_RETRIES = 10;
  for (let x = 0; x < MAX_RETRIES; x++) {
    try {
      return await fn();
    } catch (e) {
      console.log("e :", e);
      await new Promise((r) => setTimeout(r, RETRY_DELAY));
    }
  }
  throw sendError("Max retries reached");
};
var findWord = (text = "", word = "") => {
  if (!text) return null;
  return text.toLowerCase().includes(word.toLowerCase());
};
var normalizeText = (text = "") => {
  if (!text) return null;
  return text.replace(/\u202E([\s\S]*?)\u202C/g, (_2, segmen) => Array.from(segmen).reverse().join("")).replace(/[\u202A-\u202E\u202C]/g, "");
};
var extractUrls = (text = "") => {
  if (!text) return [];
  const regex = /(?:https?:\/\/)?[^\s<>"']+\.[^\s<>"']+/g;
  return text.match(regex) || [];
};
var getDevice = (chatId) => {
  if (!chatId) return "unknown";
  const device = chatId?.split(":")[1]?.split("@")[0];
  switch (device) {
    case "1":
      return "android";
    case "2":
      return "ios";
    case "3":
      return "desktop";
    case "4":
      return "web";
    default:
      return "unknown";
  }
};
var getMentions = (text = "") => {
  if (!text) return [];
  const ids = /* @__PURE__ */ new Set();
  for (const match of text.matchAll(/@(\d+)/g)) {
    ids.add(match[1]);
  }
  return [...ids];
};

// src/plugins/JsonDB.ts
var CHUNK_SIZE = 1e3;
var JsonDB = class {
  session = "zaileys-sessions";
  db;
  storeDir;
  async initialize(session) {
    this.session = session;
    const authPath = `sessions/${this.session}/auth.json`;
    this.storeDir = `sessions/${this.session}/stores`;
    const dirAuth = dirname(authPath);
    if (!existsSync(dirAuth)) mkdirSync(dirAuth, { recursive: true });
    if (!existsSync(this.storeDir)) mkdirSync(this.storeDir, { recursive: true });
    const adapter = new FileSync(authPath);
    this.db = lowdb(adapter);
    this.db.defaults([]).write();
  }
  tryRecoverRaw(raw) {
    const s = raw.trim();
    try {
      return JSON.parse(s);
    } catch (_error) {
      try {
        const a = s.indexOf("[");
        const b = s.lastIndexOf("]");
        if (a !== -1 && b !== -1 && b > a) {
          const sub = s.slice(a, b + 1);
          return JSON.parse(sub);
        }
      } catch (_error2) {
      }
      try {
        const wrapped = `[${s.replace(/}\s*{/g, "},{")}]`;
        return JSON.parse(wrapped);
      } catch (_error2) {
      }
      try {
        const lines = s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const parsed = lines.map((l) => {
          try {
            return JSON.parse(l);
          } catch (_error2) {
            return null;
          }
        }).filter(Boolean);
        if (parsed.length) return parsed;
      } catch (_error2) {
      }
    }
    return null;
  }
  async chunks(key) {
    const files = readdirSync(this.storeDir).filter((f) => f.startsWith(`${key}-`) && f.endsWith(".json")).sort();
    const result = [];
    for (const file of files) {
      const full = `${this.storeDir}/${file}`;
      const adapter = new FileSync(full);
      const db = lowdb(adapter);
      try {
        db.defaults([]).write();
        result.push(...toJson(db.value()));
      } catch {
        let raw = "";
        try {
          raw = readFileSync(full, "utf8");
        } catch (_error) {
          raw = "";
        }
        const recovered = raw ? this.tryRecoverRaw(raw) : null;
        if (recovered) {
          db.setState(Array.isArray(recovered) ? recovered : [recovered]).write();
          result.push(...toJson(db.value()));
        } else {
          const corrupt = `${full}.corrupt.${Date.now()}`;
          try {
            renameSync(full, corrupt);
          } catch (_renameErr) {
          }
          try {
            writeFileSync(full, "[]", "utf8");
          } catch (_writeFileErr) {
          }
        }
      }
    }
    return result;
  }
  async writeChunks(key, items) {
    readdirSync(this.storeDir).filter((f) => f.startsWith(`${key}-`) && f.endsWith(".json")).forEach((f) => unlinkSync(`${this.storeDir}/${f}`));
    let index = 0;
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      const file = `${this.storeDir}/${key}-${index}.json`;
      const adapter = new FileSync(file);
      const db = lowdb(adapter);
      db.setState(chunk).write();
      try {
        db.write();
      } catch (err) {
        if (err?.code === "ENOENT") {
          try {
            renameSync(`${file}.tmp`, file);
          } catch (_renameErr) {
            try {
              db.write();
            } catch (_writeErr) {
              try {
                writeFileSync(file, JSON.stringify(chunk), "utf8");
              } catch (_writeFileErr) {
              }
            }
          }
        } else {
          throw err;
        }
      }
      index++;
    }
  }
  store(key) {
    return {
      read: async (id) => {
        const list = await this.chunks(key);
        const row = list.find((i) => i.id === id);
        return row ? JSON.parse(row.value) : null;
      },
      write: async (obj) => {
        const list = await this.chunks(key);
        const id = obj.key && typeof obj.key === "object" && "id" in obj.key ? obj.key.id : obj.id;
        const serialized = JSON.stringify(obj);
        const idx = list.findIndex((i) => i.id === id);
        if (idx !== -1) list[idx].value = serialized;
        else list.push({ id, value: serialized });
        await this.writeChunks(key, list);
      }
    };
  }
  async upsert(id, value) {
    const replacer = JSON.stringify(value, BufferJSON.replacer);
    const dbValue = this.db.value();
    const data = Array.isArray(dbValue) ? dbValue : [];
    const idx = data.findIndex((i) => i.id === id);
    if (idx !== -1) {
      data[idx].value = replacer;
    } else {
      data.push({ id, value: replacer });
    }
    this.db.setState(data).write();
  }
  async read(id) {
    const dbValue = this.db.value();
    const data = Array.isArray(dbValue) ? dbValue : [];
    const row = data.find((i) => i.id === id);
    if (!row || !row.value) return null;
    const creds = typeof row.value === "object" ? toString(row.value) : row.value;
    return JSON.parse(creds, BufferJSON.reviver);
  }
  async remove(id) {
    const dbValue = this.db.value();
    const data = Array.isArray(dbValue) ? dbValue : [];
    const filtered = data.filter((i) => i.id !== id);
    this.db.setState(filtered).write();
  }
  async clear() {
    const dbValue = this.db.value();
    const data = Array.isArray(dbValue) ? dbValue : [];
    const filtered = data.filter((i) => i.id === "creds");
    this.db.setState(filtered).write();
  }
  async delete() {
    this.db.setState([]);
    await this.db.write();
  }
};

// src/utils/decrypt.ts
var allocate = (str) => {
  let n = 0;
  let p = str.length;
  if (!p) return new Uint8Array(1);
  while (--p % 4 > 1 && str.charAt(p) === "=") ++n;
  return new Uint8Array(Math.ceil(str.length * 3) / 4 - n).fill(0);
};
var parseTimestamp = (timestamp) => {
  if (typeof timestamp === "string") return parseInt(timestamp, 10);
  if (typeof timestamp === "number") return timestamp;
  return timestamp;
};
var fromObject = (args) => {
  const fingerprint = args.fingerprint || {};
  const f = {
    ...fingerprint,
    deviceIndexes: Array.isArray(fingerprint.deviceIndexes) ? fingerprint.deviceIndexes : []
  };
  const message = {
    keyData: Array.isArray(args.keyData) ? args.keyData : new Uint8Array(),
    fingerprint: {
      rawId: fingerprint.rawId || 0,
      currentIndex: fingerprint.rawId || 0,
      deviceIndexes: f.deviceIndexes
    },
    timestamp: parseTimestamp(args.timestamp)
  };
  if (typeof args.keyData === "string") {
    message.keyData = allocate(args.keyData);
  }
  return message;
};

// src/modules/store.ts
var StoreHandler = async (db) => {
  return {
    bind: (client) => {
      client?.socket?.ev.on("messaging-history.set", async (update) => {
        const { chats, contacts, messages } = update;
        for (const chat of chats) {
          await db.store("chats").write(chat);
        }
        for (const contact of contacts) {
          await db.store("contacts").write(contact);
        }
        for (const message of messages) {
          if (!message.message) return;
          if (message.message?.protocolMessage) return;
          await db.store("messages").write(message);
        }
      });
      client?.socket?.ev.on("messages.upsert", async ({ messages }) => {
        for (const message of messages) {
          await db.store("messages").write(message);
        }
      });
      client?.socket?.ev.on("chats.upsert", async (chats) => {
        for (const chat of chats) {
          await db.store("chats").write(chat);
        }
      });
      client?.socket?.ev.on("contacts.upsert", async (contacts) => {
        for (const contact of contacts) {
          await db.store("contacts").write(contact);
        }
      });
      client?.socket?.ev.on("groups.update", async ([event]) => {
        if (event.id) {
          const metadata = await client?.socket?.groupMetadata(event.id);
          client.cache.set(event.id, metadata);
        }
      });
      client?.socket?.ev.on("group-participants.update", async (event) => {
        const metadata = await client?.socket?.groupMetadata(event.id);
        client.cache.set(event.id, metadata);
      });
    }
  };
};

// src/modules/auth.ts
var AuthHandler = async (db) => {
  const creds = await tryAgain(() => db.read("creds")) || initAuthCreds();
  const store = await StoreHandler(db);
  return {
    db,
    store,
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          for (const id of ids) {
            let value = await tryAgain(() => db.read(`${type}-${id}`));
            if (type === "app-state-sync-key" && value) {
              value = fromObject(value);
            }
            if (value !== null && value !== void 0) {
              data[id] = value;
            }
          }
          return data;
        },
        set: async (data) => {
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const name = `${category}-${id}`;
              if (value) {
                await tryAgain(() => db.upsert(name, value));
              } else {
                await tryAgain(() => db.remove(name));
              }
            }
          }
        }
      }
    },
    clear: async () => {
      await tryAgain(() => db.clear());
    },
    saveCreds: async () => {
      await tryAgain(() => db.upsert("creds", creds));
    },
    removeCreds: async () => {
      await tryAgain(() => db.delete());
    }
  };
};

// src/modules/plugins.ts
var PluginsHandler = (necessary, props) => {
  const plugins = props.plugins?.find((x) => x?.necessary == necessary);
  return plugins;
};

// src/modules/database.ts
var CredsHandler = async (props) => {
  const db = PluginsHandler("database", props) || new JsonDB();
  await db.initialize(props.session || "default");
  return await AuthHandler(db);
};
var MessagesMediaType = {
  text: "text",
  conversation: "text",
  imageMessage: "image",
  contactMessage: "contact",
  locationMessage: "location",
  documentMessage: "document",
  audioMessage: "audio",
  videoMessage: "video",
  protocolMessage: "protocol",
  contactsArrayMessage: "contacts",
  highlyStructuredMessage: "highlyStructured",
  sendPaymentMessage: "sendPayment",
  liveLocationMessage: "location",
  requestPaymentMessage: "requestPayment",
  declinePaymentRequestMessage: "declinePaymentRequest",
  cancelPaymentRequestMessage: "cancelPaymentRequest",
  templateMessage: "template",
  stickerMessage: "sticker",
  groupInviteMessage: "groupInvite",
  templateButtonReplyMessage: "buttons",
  productMessage: "product",
  deviceSentMessage: "deviceSent",
  listMessage: "list",
  viewOnceMessage: "viewOnce",
  orderMessage: "order",
  listResponseMessage: "list",
  ephemeralMessage: "ephemeral",
  invoiceMessage: "invoice",
  buttonsMessage: "buttons",
  buttonsResponseMessage: "buttons",
  paymentInviteMessage: "paymentInvite",
  interactiveMessage: "interactive",
  reactionMessage: "reaction",
  stickerSyncRmrMessage: "sticker",
  interactiveResponseMessage: "interactiveResponse",
  pollCreationMessage: "pollCreation",
  pollUpdateMessage: "pollUpdate",
  keepInChatMessage: "keepInChat",
  documentWithCaptionMessage: "document",
  requestPhoneNumberMessage: "requestPhoneNumber",
  viewOnceMessageV2: "viewOnce",
  encReactionMessage: "reaction",
  editedMessage: "text",
  viewOnceMessageV2Extension: "viewOnce",
  pollCreationMessageV2: "pollCreation",
  scheduledCallCreationMessage: "scheduledCallCreation",
  groupMentionedMessage: "groupMentioned",
  pinInChatMessage: "pinInChat",
  pollCreationMessageV3: "pollCreation",
  scheduledCallEditMessage: "scheduledCallEdit",
  ptvMessage: "ptv",
  botInvokeMessage: "botInvoke",
  callLogMesssage: "callLog",
  encCommentMessage: "encComment",
  bcallMessage: "bcall",
  lottieStickerMessage: "lottieSticker",
  eventMessage: "event",
  commentMessage: "comment",
  newsletterAdminInviteMessage: "text",
  extendedTextMessageWithParentKey: "text",
  extendedTextMessage: "text",
  placeholderMessage: "placeholder",
  encEventUpdateMessage: "encEventUpdate"
};
var MessagesVerifiedPlatformType = {
  whatsapp: "0@s.whatsapp.net",
  meta: "13135550002@s.whatsapp.net",
  chatgpt: "18002428478@s.whatsapp.net",
  copilot: "18772241042@s.whatsapp.net",
  instagram: "447723442971@s.whatsapp.net",
  tiktok: "6285574670498@s.whatsapp.net"
};
var MessagesEnumType = z.enum([
  "text",
  "image",
  "contact",
  "location",
  "document",
  "audio",
  "video",
  "protocol",
  "contacts",
  "highlyStructured",
  "sendPayment",
  "requestPayment",
  "declinePaymentRequest",
  "cancelPaymentRequest",
  "template",
  "sticker",
  "groupInvite",
  "product",
  "deviceSent",
  "list",
  "viewOnce",
  "order",
  "ephemeral",
  "invoice",
  "buttons",
  "paymentInvite",
  "interactive",
  "reaction",
  "sticker",
  "interactiveResponse",
  "pollCreation",
  "pollUpdate",
  "keepInChat",
  "document",
  "requestPhoneNumber",
  "viewOnce",
  "reaction",
  "text",
  "viewOnce",
  "pollCreation",
  "scheduledCallCreation",
  "groupMentioned",
  "pinInChat",
  "pollCreation",
  "scheduledCallEdit",
  "ptv",
  "botInvoke",
  "callLog",
  "encComment",
  "bcall",
  "lottieSticker",
  "event",
  "comment",
  "placeholder",
  "encEventUpdate"
]);
var MessagesDeviceEnumType = z.enum([
  "unknown",
  "android",
  "ios",
  "desktop",
  "web"
]);
var ExtractorMessagesType = z.object({
  chatId: z.string(),
  channelId: z.string(),
  uniqueId: z.string(),
  receiverId: z.string(),
  receiverName: z.string(),
  roomId: z.string(),
  roomName: z.string(),
  senderLid: z.string(),
  senderId: z.string(),
  senderName: z.string(),
  senderDevice: MessagesDeviceEnumType,
  chatType: MessagesEnumType,
  timestamp: z.number(),
  text: z.string().nullable(),
  mentions: z.string().array(),
  links: z.string().array(),
  isPrefix: z.boolean(),
  isSpam: z.boolean(),
  isFromMe: z.boolean(),
  isTagMe: z.boolean(),
  isGroup: z.boolean(),
  isStory: z.boolean(),
  isViewOnce: z.boolean(),
  isEdited: z.boolean(),
  isDeleted: z.boolean(),
  isPinned: z.boolean(),
  isUnPinned: z.boolean(),
  isChannel: z.boolean(),
  isBroadcast: z.boolean(),
  isEphemeral: z.boolean(),
  isForwarded: z.boolean(),
  citation: z.record(z.string(), z.boolean()).nullable(),
  media: z.object({
    buffer: z.function(),
    stream: z.function()
  }).loose().nullable(),
  message: z.function({
    input: [],
    output: z.record(z.string(), z.any())
  }),
  get replied() {
    return ExtractorMessagesType.nullable();
  }
});
var defaultBoolean = (state) => z$1.boolean().default(state).optional();

// src/types/classes/Client.ts
var PluginsType = z3.array(z3.object({
  necessary: z3.string()
  // Add other properties as needed based on actual plugin structure
}).passthrough()).optional();
var LimiterType = z3.object({
  durationMs: z3.number(),
  maxMessages: z3.number()
}).optional();
var CitationType = z3.partialRecord(z3.string(), z3.number().array()).optional();
var FakeReplyType = z3.object({
  provider: z3.enum(Object.keys(MessagesVerifiedPlatformType))
}).optional();
var ClientBaseType = z3.object({
  session: z3.string().default("zaileys-sessions").optional(),
  prefix: z3.string().optional(),
  ignoreMe: defaultBoolean(true),
  showLogs: defaultBoolean(true),
  autoMentions: defaultBoolean(true),
  autoOnline: defaultBoolean(true),
  autoRead: defaultBoolean(true),
  autoPresence: defaultBoolean(true),
  autoRejectCall: defaultBoolean(true),
  plugins: PluginsType,
  limiter: LimiterType,
  citation: CitationType,
  fakeReply: FakeReplyType
});
var ClientAuthPairingType = z3.object({
  authType: z3.literal("pairing"),
  phoneNumber: z3.number()
});
var ClientAuthQRType = z3.object({
  authType: z3.literal("qr")
});
var ClientOptionsType = z3.discriminatedUnion("authType", [
  ClientAuthPairingType.extend(ClientBaseType.shape),
  ClientAuthQRType.extend(ClientBaseType.shape)
]);
var EventEnumType = z3.enum([
  "connection",
  "messages",
  "calls",
  "webhooks"
]);
var displayBanner = async (text = "ZAILEYS") => {
  figlet(text, async (err, data) => {
    if (err) return;
    console.log(chalk.gray.italic(data));
  });
};

// src/extractor/calls.ts
var CallsExtractor = async (client, caller) => {
  const payload = {};
  payload.callId = caller.id;
  payload.roomId = caller.chatId;
  payload.callerId = caller.from;
  payload.date = caller.date;
  payload.offline = caller.offline;
  payload.status = caller.status;
  payload.isVideo = !!caller.isVideo;
  payload.isGroup = !!caller.isGroup;
  return payload;
};
var cache = new NodeCache2({ stdTTL: 3600, checkperiod: 600 });
var LimiterHandler = async (key, max, ms) => {
  const limiter = new Bottleneck({
    maxConcurrent: 1,
    minTime: 0,
    reservoir: max,
    reservoirRefreshAmount: max,
    reservoirRefreshInterval: ms
  });
  const now = Date.now();
  const user = toJson(cache.get(key) || { count: 0, last: 0 });
  if (now - user.last > ms) user.count = 0;
  user.count += 1;
  user.last = now;
  cache.set(key, user);
  try {
    return await limiter.schedule(async () => {
      if (user.count > max) {
        cache.set(key, { ...user, blacklisted: now + ms });
        return true;
      }
      return false;
    });
  } catch (err) {
    console.error("Error detecting spam:", err);
    return false;
  }
};

// src/extractor/messages.ts
var MessagesExtractor = async (client, message) => {
  let MAX_REPLIES = 0;
  const CLONE = message;
  const extract = async (obj, isReplied, isExtract) => {
    let msg = toJson(obj);
    if (!msg.message || !msg?.key?.id) return null;
    if (msg?.messageStubType || !!msg?.messageStubParameters || msg?.message?.botInvokeMessage || msg.message?.protocolMessage?.peerDataOperationRequestResponseMessage) return null;
    if (msg?.key?.fromMe && !msg?.participant && msg?.key?.remoteJid != "status@broadcast" && client.props?.ignoreMe && !MAX_REPLIES && true) return null;
    const pinId = msg?.message?.pinInChatMessage?.key?.id;
    const isPinned = msg?.message?.pinInChatMessage?.type == 1;
    const isUnPinned = msg?.message?.pinInChatMessage?.type == 2;
    if (pinId && client.db) {
      const read = await client.db.store("messages").read(pinId);
      msg = read;
    }
    const protocolId = !msg?.message?.protocolMessage?.editedMessage && msg?.message?.protocolMessage?.key?.id;
    const isDeleted = !!protocolId;
    if (protocolId && client.db) {
      const read = await client.db.store("messages").read(protocolId);
      msg = read;
    }
    const edited = msg?.message?.protocolMessage?.editedMessage || msg?.message?.editedMessage;
    if (edited) {
      const id = edited?.message?.protocolMessage?.key?.id;
      if (id && client.db) {
        const read3 = await client.db.store("messages").read(id);
        const editType = getContentType(edited?.message?.protocolMessage?.editedMessage);
        const readType = getContentType(read3?.message);
        let editing = void 0;
        if (editType && edited?.message?.protocolMessage?.editedMessage) {
          editing = edited.message.protocolMessage.editedMessage[editType];
          if (readType && read3?.message) {
            read3.message[readType] = _.merge(read3.message[readType], editing);
          }
        }
        msg = read3 || msg;
      }
    }
    const contentType = getContentType(msg?.message?.protocolMessage?.editedMessage || msg?.message);
    if (!contentType) return null;
    const payload = {};
    payload.chatId = msg?.message?.protocolMessage?.key?.id || msg?.key?.id || "";
    payload.channelId = "";
    payload.uniqueId = "";
    payload.receiverId = jidNormalizedUser(client.socket?.user?.id || "");
    payload.receiverName = client.socket?.user?.name || client.socket?.user?.verifiedName || "";
    payload.roomId = jidNormalizedUser(message?.key?.remoteJid || "");
    if (client.db) {
      const roomName = await client.db.store("chats").read(payload.roomId);
      payload.roomName = toJson(roomName)?.name || "";
    }
    payload.senderLid = msg?.message?.protocolMessage?.key?.senderLid || msg?.key?.senderLid || msg?.key?.participantLid || "";
    payload.senderId = jidNormalizedUser(msg?.participant || msg?.key?.participant || msg?.key?.remoteJid);
    if (client.db) {
      const senderName = await client.db.store("chats").read(payload.senderId);
      payload.senderLid = payload.senderLid || toJson(senderName)?.lidJid || "";
      payload.senderName = msg?.pushName || msg?.verifiedBizName || toJson(senderName)?.name || payload.receiverName;
    }
    payload.senderDevice = getDevice(payload.chatId);
    if (payload.senderId == payload.receiverId) {
      payload.senderName = payload.receiverName;
    }
    payload.roomName = payload.roomName || payload.senderName || (payload.roomId || "").split("@")[0];
    payload.chatType = MessagesMediaType[contentType];
    payload.timestamp = Number(msg?.messageTimestamp || 0);
    payload.text = null;
    payload.mentions = [];
    payload.links = [];
    payload.isPrefix = false;
    payload.isSpam = false;
    payload.isFromMe = message?.key?.fromMe || false;
    payload.isTagMe = false;
    payload.isGroup = payload.roomId.includes("@g.us");
    payload.isStory = payload.roomId.includes("@broadcast");
    payload.isViewOnce = false;
    payload.isEdited = false;
    payload.isDeleted = isDeleted;
    payload.isPinned = isPinned;
    payload.isUnPinned = isUnPinned;
    payload.isChannel = payload.roomId.includes("@newsletter");
    payload.isBroadcast = !!message?.broadcast;
    payload.isEphemeral = false;
    payload.isForwarded = false;
    if (!isReplied && true) {
      const limiter = await LimiterHandler(payload.roomId, client.props.limiter?.maxMessages ?? 0, client.props.limiter?.durationMs ?? 0);
      payload.isSpam = limiter;
    }
    if (payload.isFromMe) {
      payload.senderId = payload.receiverId;
      payload.senderName = payload.receiverName;
    }
    payload.citation = null;
    payload.media = null;
    payload.replied = null;
    payload.channelId = payload.roomId.split("@")[0] + "-" + payload.senderId.split("@")[0];
    payload.uniqueId = payload.channelId + "-" + payload.chatId;
    const citation = client.props?.citation || {};
    if (Object.keys(citation).length) {
      payload.citation = {};
      for (const key of Object.keys(citation)) {
        const slug = "is" + _.upperFirst(_.camelCase(key));
        const citationEntry = citation[key];
        if (citationEntry && Array.isArray(citationEntry)) {
          const senderId = payload.senderId.split("@")[0];
          const roomId = payload.roomId.split("@")[0];
          const citationRecord = citation;
          payload.citation[slug] = (senderId ? (citationRecord[key] || []).includes(Number(senderId)) : false) || (roomId ? (citationRecord[key] || []).includes(Number(roomId)) : false);
        }
      }
    }
    const media = msg?.message?.editedMessage?.[contentType] || msg?.message?.protocolMessage?.editedMessage?.[contentType] || msg?.message?.[contentType]?.message?.documentMessage || msg?.message?.[contentType];
    if (payload.chatType != "text") {
      payload.media = {
        ..._.omit(media, [
          "url",
          "contextInfo",
          "fileSha256",
          "fileEncSha256",
          "mediaKey",
          "directPath",
          "waveform",
          "thumbnail",
          "jpegThumbnail",
          "thumbnailEncSha256",
          "thumbnailSha256",
          "thumbnailDirectPath",
          "firstFrameSidecar",
          "streamingSidecar",
          "scansSidecar",
          "callKey",
          "message",
          "key",
          "midQualityFileSha256"
        ]),
        buffer: () => downloadMediaMessage(message, "buffer", {}),
        stream: () => downloadMediaMessage(message, "stream", {})
      };
    }
    const repliedId = toJson(msg?.message?.[contentType])?.contextInfo?.stanzaId;
    if (repliedId && MAX_REPLIES < 1 && client.db) {
      MAX_REPLIES++;
      const replied = await client.db.store("messages").read(repliedId);
      if (!replied) {
        payload.replied = await extract(msg, true);
      } else {
        payload.replied = await extract(replied, true);
      }
      MAX_REPLIES = 0;
    }
    const text = typeof media == "string" ? media : media?.text || media?.caption || media?.name || media?.displayName || media?.conversation || media?.contentText || media?.selectedDisplayText || "";
    payload.text = normalizeText(text) || "";
    payload.mentions = getMentions(payload.text || "");
    payload.links = extractUrls(payload.text || "");
    const messaging = toJson(msg?.message?.[contentType]);
    payload.isPrefix = !!(client.props?.prefix && payload.text?.startsWith(client.props?.prefix));
    payload.isTagMe = payload.mentions.includes(payload.receiverId.split("@")[0] || "");
    payload.isEdited = !!edited;
    payload.isEphemeral = !!findWord(toString(messaging?.contextInfo), "ephemeralSettingTimestamp");
    payload.isForwarded = !!findWord(toString(messaging?.contextInfo), "forwardingScore");
    payload.isViewOnce = !!messaging?.viewOnce;
    if (payload.isPrefix) {
      payload.text = payload.text.replace(new RegExp(`^${client.props?.prefix}`), "");
    }
    payload.message = () => CLONE;
    return payload;
  };
  return extract(message);
};

// src/classes/Listener.ts
var Listener = class {
  client;
  async bind(client) {
    this.client = client;
    this.client.socket?.ev.on("connection.update", async (update) => {
      await this.connection(update);
    });
    this.client.socket?.ev.on("messages.upsert", async ({ messages }) => {
      for (const message of messages) {
        await this.messages(message);
      }
    });
    this.client.socket?.ev.on("call", async (callers) => {
      for (const caller of callers) {
        await this.calls(caller);
      }
    });
    this.client.socket?.ev.on("creds.update", () => {
    });
    if (this.client.socket?.ws) {
      const originalEmit = this.client.socket.ws.emit.bind(this.client.socket.ws);
      this.client.socket.ws.emit = (event, ...args) => {
        if (event === "error" && args[0]) {
          const errorMessage = args[0].message || args[0]?.toString();
          if (errorMessage.includes("Closing open session in favor of incoming prekey bundle") || errorMessage.includes("Closing stale open session for new outgoing prekey bundle") || errorMessage.includes("Closing session: SessionEntry")) {
            this.handleSessionClosing();
          }
        }
        return originalEmit(event, ...args);
      };
    }
  }
  async handleSessionClosing() {
    this.client.spinner.start("Processing session changes...");
    await new Promise((resolve) => setTimeout(resolve, 3e3));
    this.client.spinner.success("Session processing completed");
  }
  async connection(update) {
    const { connection, lastDisconnect, qr } = update;
    this.client.emit("connection", { status: "connecting" });
    if (this.client.props.authType === "qr" && qr) {
      this.client.spinner.info(`Please scan the QR

${await QRCode.toString(qr, { type: "terminal", small: true })}`);
      return;
    }
    if (connection === "close") {
      const code = toJson(lastDisconnect?.error)?.output?.statusCode;
      const errorMessage = lastDisconnect?.error?.message || "";
      const isReconnect = typeof code === "number" && code !== DisconnectReason.loggedOut;
      if (errorMessage.includes("Closing open session in favor of incoming prekey bundle") || errorMessage.includes("Closing stale open session for new outgoing prekey bundle") || errorMessage.includes("Closing session: SessionEntry")) {
        this.client.spinner.start("Processing session changes...");
        await new Promise((resolve) => setTimeout(resolve, 2e3));
        this.client.spinner.success("Session processing completed");
        return;
      }
      this.client.spinner.error(`[Connection Closed] [${code}]
${errorMessage} 
`);
      if (code === 401 || code === 405 || code === 500) {
        this.client.spinner.error("Invalid session, please delete manually");
        this.client.spinner.error(`Session "${this.client.props.session}" has not valid, please delete it`);
        return;
      }
      if (isReconnect) {
        this.client.spinner.warn("Connection lost. Attempting auto-reload...");
        const clientRecord = this.client;
        if (typeof clientRecord.autoReload === "function") {
          await clientRecord.autoReload();
        }
      }
    } else if (connection === "open") {
      if (this.client.socket?.user) {
        const id = jidNormalizedUser(this.client.socket.user.id).split("@")[0];
        const name = this.client.socket.user.name || this.client.socket.user.verifiedName;
        const clientRecord = this.client;
        if (typeof clientRecord.resetRetryCount === "function") {
          clientRecord.resetRetryCount();
        }
        this.client.spinner.success(`Connected as ${chalk.green(name || id)}
`);
        this.client.emit("connection", { status: "open" });
      }
    }
  }
  async messages(message) {
    if (this.client.props?.autoRead && this.client.socket) {
      if (message?.key) {
        await this.client.socket.readMessages([message.key]);
      }
    }
    const extract = await MessagesExtractor(this.client, message);
    if (extract) {
      this.client.emit("messages", extract);
    }
  }
  async calls(caller) {
    if (this.client.props?.autoRejectCall && this.client.socket) {
      await this.client.socket.rejectCall(caller.id, caller.from);
    }
    const extract = await CallsExtractor(this.client, caller);
    this.client.emit("calls", extract);
  }
};
var RelayTextType = z$1.string().or(z$1.object({
  text: z$1.string(),
  roomId: z$1.string().optional()
}));
var RelayReplyType = z$1.string().or(z$1.object({
  text: z$1.string(),
  roomId: z$1.string().optional()
}));

// src/classes/Relay.ts
var Relay = class {
  client;
  message;
  bind(client) {
    this.client = client;
    this.client.on("messages", (ctx) => {
      this.message = ctx;
    });
  }
  async text(props) {
    await delay(0);
    const params = RelayTextType.parse(props);
    if (typeof params == "string") {
      if (this.client.socket) {
        await this.client.socket.sendMessage(this.message?.roomId, {
          text: params
        });
      }
    }
    if (typeof params == "object" && params !== null) {
      if (this.client.socket && params.text) {
        await this.client.socket.sendMessage(
          params?.roomId || this.message?.roomId,
          { text: params.text }
        );
      }
    }
  }
  async reply(props) {
    await delay(0);
    const params = RelayReplyType.parse(props);
    const quoted = this.message?.message();
    if (this.client.props?.fakeReply?.provider) {
      const provider = this.client.props.fakeReply.provider;
      if (quoted && quoted.key) {
        quoted.key.remoteJid = MessagesVerifiedPlatformType[provider];
      }
    }
    if (typeof params == "string") {
      if (this.client.socket) {
        const options = quoted ? { quoted } : void 0;
        await this.client.socket.sendMessage(
          this.message?.roomId,
          { text: params },
          options
        );
      }
    }
    if (typeof params == "object") {
      if (this.client.socket) {
        const options = quoted ? { quoted } : void 0;
        await this.client.socket.sendMessage(
          params?.roomId || this.message?.roomId,
          { text: params?.text },
          options
        );
      }
    }
  }
};

// src/classes/Client.ts
var Client = class {
  props;
  db;
  logger = pino({ level: "silent", enabled: false });
  events = new EventEmitter();
  relay;
  retryCount = 0;
  maxRetries = 10;
  connectionTimeout;
  spinner = createSpinner("", { color: "green" });
  socket;
  cache = new NodeCache2({ stdTTL: 5 * 60, useClones: false });
  constructor(props) {
    this.props = ClientOptionsType.parse(props);
    this.initialize();
    return new Proxy(this, {
      get(target, prop) {
        if (typeof prop === "string" && prop in target) return target[prop];
        if (typeof prop === "string") return target.relay[prop];
        return void 0;
      }
    });
  }
  async initialize() {
    console.clear();
    await displayBanner();
    await delay(1e3);
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
      defaultQueryTimeoutMs: void 0,
      msgRetryCounterCache: new NodeCache2(),
      mediaCache: new NodeCache2({ stdTTL: 60 }),
      userDevicesCache: new NodeCache2(),
      cachedGroupMetadata: async (jid) => this.cache.get(jid),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, this.logger)
      },
      getMessage: async (key) => {
        if (!key?.id) return void 0;
        const message = await db.store("messages").read(key.id);
        return message || void 0;
      }
    });
    await this.socket?.ev.on("creds.update", saveCreds);
    if (this.props.authType === "pairing" && this.props.phoneNumber && !this.socket?.authState.creds.registered) {
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
      }, 5e3);
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
  startConnectionTimeout() {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
    }
    this.connectionTimeout = setTimeout(() => {
      this.handleConnectionTimeout();
    }, 6e4);
  }
  handleConnectionTimeout() {
    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      this.spinner.warn(
        `Connection timeout. Retrying... (${this.retryCount}/${this.maxRetries})`
      );
      this.autoReload();
    } else {
      this.spinner.error(
        `Max retries reached (${this.maxRetries}). Connection failed.`
      );
      process.exit(1);
    }
  }
  async autoReload() {
    try {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
      }
      if (this.socket) {
        this.socket.end?.(void 0);
        this.socket = void 0;
      }
      await delay(2e3);
      await this.initialize();
    } catch (error) {
      this.spinner.error(`Auto-reload failed: ${error.message}`);
      this.handleConnectionTimeout();
    }
  }
  resetRetryCount() {
    this.retryCount = 0;
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
    }
  }
  on(event, handler) {
    this.events.on(event, handler);
  }
  emit(event, ...args) {
    this.events.emit(event, ...args);
  }
};

export { CitationType, Client, ClientAuthPairingType, ClientAuthQRType, ClientBaseType, ClientOptionsType, EventEnumType, FakeReplyType, JsonDB, LimiterType, PluginsType };
