import { ConnectionState, DisconnectReason, downloadMediaMessage, getContentType, getDevice, jidNormalizedUser, proto, WACallEvent, WASocket } from "baileys";
import { Kysely } from "kysely";
import QRCode from "qrcode";
import { z } from "zod";
import { DB } from "../database/schema";
import { extractUrls, findWord, getMentions, normalizeText, randomChar, removeKeys, toJson, toString } from "../helpers/utils";
import { CallsParserBaseType } from "../types/parser/calls";
import { MessagesMediaType, MessagesParserType } from "../types/parser/messages";
import Client from "./Client";
import Bottleneck from "bottleneck";
import { limiter } from "../adapter/limiter";
import { WebhooksParserBaseType } from "../types/parser/webhooks";
import { Context } from "hono";
import { BlankEnv, BlankInput } from "hono/types";

export default class Parser {
  private maxReplies = 0;

  constructor(private socket: WASocket, private client: Client, private db: Kysely<DB>) {}

  async connection(update: Partial<ConnectionState>) {
    this.client.startSpinner("connection", "Connecting to WhatsApp...");
    const { connection, lastDisconnect, qr } = update;
    this.client.emit("connection", { status: "connecting" });

    if (this.client.options?.authType === "qr" && qr) {
      console.log();
      console.log(await QRCode.toString(qr, { type: "terminal", small: true }));
      this.client.startSpinner("qr", "Waiting for QR code scan...");
      this.socket?.ev.on("connection.update", () => this.client.stopSpinner("qr", false));
      return;
    }

    if (connection === "close") {
      const code = (lastDisconnect?.error as any)?.output?.statusCode;
      const isReconnect = code === DisconnectReason.restartRequired || code === DisconnectReason.connectionLost;
      this.client.failSpinner("connection", `[Connection Closed] [${code}]\n${lastDisconnect?.error?.message}\n`);

      if (code === 401 || code === 405 || code === 500) {
        console.error("Invalid session, please delete manually");
        return;
      }

      if (isReconnect && connection == "close") {
        await this.client.initialize();
      }
    } else if (connection === "open") {
      this.client.stopSpinner("connection", true, "Connected to WhatsApp\n");
      this.client.emit("connection", { status: "open" });
    }

    this.client.stopSpinner("connection", false);
  }

  async messages(message: proto.IWebMessageInfo, isReplied?: boolean, isExtract?: boolean) {
    if (
      message?.messageStubType ||
      message?.messageStubParameters?.length ||
      message?.message?.protocolMessage?.peerDataOperationRequestResponseMessage ||
      message?.message?.botInvokeMessage ||
      !message?.key?.id ||
      !message?.message
    )
      return null;
    if (this.client.options?.ignoreMe && message?.key?.fromMe && !this.maxReplies && !isExtract && message?.key?.remoteJid != "status@broadcast" && !message?.participant)
      return null;

    if (this.client.options?.autoRead) {
      await this.socket.readMessages([message?.key]);
    }

    const oriMessage = message;

    const pinId = message?.message?.pinInChatMessage?.key?.id;
    const isPinned = (message?.message?.pinInChatMessage as any)?.type == 1;
    const isUnPinned = (message?.message?.pinInChatMessage as any)?.type == 2;

    if (pinId) {
      const pinValue = await this.db.selectFrom("messages").select("value").where("id", "=", pinId).executeTakeFirst();
      const pin = toJson(pinValue?.value!);
      message = pin;
    }

    const protocolId = !message?.message?.protocolMessage?.editedMessage && message?.message?.protocolMessage?.key?.id;
    const isDeleted = !!protocolId;

    if (protocolId) {
      const protocolValue = await this.db.selectFrom("messages").select("value").where("id", "=", protocolId).executeTakeFirst();
      const protocol = toJson(protocolValue?.value!);
      message = protocol;
    }

    const payload: z.infer<typeof MessagesParserType> = {} as never;
    const contentType = getContentType((message?.message as any)?.protocolMessage?.editedMessage || message?.message!);

    payload.chatId = message?.message?.protocolMessage?.key?.id || message?.key?.id!;
    payload.channelId = "";
    payload.uniqueId = "";

    payload.receiverId = jidNormalizedUser(this.socket.user?.id);
    payload.receiverName = (this.socket.user?.name || this.socket.user?.verifiedName)!;

    payload.roomId = jidNormalizedUser(message?.key?.remoteJid!);

    const roomName = await this.db.selectFrom("chats").select("value").where("id", "=", payload.roomId).executeTakeFirst();
    payload.roomName = toJson(roomName?.value!)?.name;

    payload.senderId = jidNormalizedUser((message?.participant || message?.key?.participant || message?.key?.remoteJid)!);

    const senderName = await this.db.selectFrom("chats").select("value").where("id", "=", payload.senderId).executeTakeFirst();
    payload.senderName = message?.pushName || message?.verifiedBizName || toJson(senderName?.value!)?.name || payload.receiverName;
    payload.roomName = payload.roomName || payload.senderName;

    payload.senderDevice = getDevice(payload.chatId);

    payload.chatType = MessagesMediaType[contentType! as never];
    payload.timestamp = ((message?.messageTimestamp as any)?.low || message?.messageTimestamp)! || 0;
    payload.mentions = [];
    payload.text = null;
    payload.links = [];

    payload.isPrefix = false;
    payload.isSpam = false;
    payload.isFromMe = message?.key?.fromMe!;
    payload.isTagMe = false;
    payload.isGroup = payload.roomId.includes("@g.us")!;
    payload.isStory = payload.roomId.includes("@broadcast")!;
    payload.isViewOnce = false;
    payload.isEdited = false;
    payload.isDeleted = isDeleted;
    payload.isPinned = isPinned;
    payload.isUnPinned = isUnPinned;
    payload.isChannel = payload.roomId.includes("@newsletter")!;
    payload.isBroadcast = !!message?.broadcast;
    payload.isEphemeral = false;
    payload.isForwarded = false;

    if (!isReplied && !isExtract) {
      const limiting = await limiter(payload.roomId, this.client.options.limiter?.maxMessages!, this.client.options.limiter?.durationMs!);
      payload.isSpam = limiting;
    }

    if (payload.isFromMe) {
      payload.senderId = payload.receiverId;
      payload.senderName = payload.receiverName;
    }

    payload.citation = null;
    payload.media = null;
    payload.replied = null;

    payload.channelId = payload.roomId.split("@")[0]! + "-" + payload.senderId.split("@")[0]!;
    payload.uniqueId = payload.channelId + "-" + payload.chatId;

    const citation = this.client.options?.citation;
    if (Object.keys(citation!).length) {
      payload.citation = {};
      for (const key of Object.keys(citation!)) {
        payload.citation![key] = citation![key].includes(Number(payload.senderId.split("@")[0]!)) || citation![key].includes(Number(payload.roomId.split("@")[0]!));
      }
    }

    const media =
      ((message?.message?.protocolMessage?.editedMessage?.[contentType! as never] as any) || message?.message?.[contentType!])?.message?.documentMessage ||
      (message?.message?.[contentType!] as any);
    if (payload.chatType != "text") {
      payload.media = {
        ...removeKeys(media, [
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
          "midQualityFileSha256",
        ]),
        buffer: async () => await downloadMediaMessage(message, "buffer", {}),
        stream: async () => await downloadMediaMessage(message, "stream", {}),
      } as never;
    }

    const repliedId = (message?.message?.[contentType as never] as any)?.contextInfo?.stanzaId;

    if (repliedId && this.maxReplies < 1) {
      this.maxReplies++;
      const repliedValue = await this.db.selectFrom("messages").select("value").where("id", "=", repliedId).executeTakeFirst();
      const replied = toJson(repliedValue?.value!);
      if (!replied) {
        const msg = message as any;
        const type = getContentType(msg.message?.extendedTextMessage?.contextInfo.quotedMessage) as any;
        msg.key.id = msg.message?.extendedTextMessage?.contextInfo.stanzaId;
        msg.message[type] = msg.message?.extendedTextMessage?.contextInfo.quotedMessage[type];
        delete msg.message?.extendedTextMessage;

        payload.replied = (await this.messages(msg, true)) as never;
      } else {
        payload.replied = (await this.messages(replied, true)) as never;
      }

      this.maxReplies = 0;
    }

    const text = typeof media == "string" ? media : media?.text || media?.caption || media?.name || media?.displayName || "";

    payload.text = normalizeText(text) || null;
    payload.mentions = getMentions(payload.text!)!;
    payload.links = extractUrls(payload.text!)!;

    const messaged = message?.message?.[contentType! as never] as any;
    payload.isPrefix = !!this.client.options?.prefix && !!payload.text?.startsWith(this.client.options?.prefix!)!;
    payload.isTagMe = payload.mentions.includes(payload.receiverId.split("@")[0]!);
    payload.isEdited = findWord(toString(message), "editedMessage")!;
    payload.isEphemeral = findWord(toString(messaged?.contextInfo), "ephemeralSettingTimestamp")!;
    payload.isForwarded = findWord(toString(messaged?.contextInfo), "forwardingScore")!;
    payload.isViewOnce = !!messaged?.viewOnce;

    if (payload.isPrefix) {
      payload.text = payload.text!.replace(new RegExp(`^${this.client.options?.prefix}`), "");
    }

    payload.message = () => oriMessage;

    if (!isReplied) {
      this.client.emit("messages", payload);
    }

    return payload;
  }

  async calls(caller: WACallEvent) {
    if (this.client.options?.autoRejectCall) {
      await this.socket.rejectCall(caller.id, caller.from);
    }

    const payload: z.infer<typeof CallsParserBaseType> = {} as never;

    payload.callId = caller.id;
    payload.roomId = caller.chatId;
    payload.callerId = caller.from;
    payload.date = caller.date;
    payload.offline = caller.offline;
    payload.status = caller.status;
    payload.isVideo = !!caller.isVideo;
    payload.isGroup = !!caller.isGroup;

    this.client.emit("calls", payload);
  }

  async webhooks(c: Context<BlankEnv, "/webhooks", BlankInput>) {
    let raw;
    const method = c.req.method;
    const query = c.req.query();
    const type = c.req.header("content-type") || "";
    const data = { query, json: null, form: null, raw: null } as any;

    if (method != "GET") {
      if (type.includes("application/json")) {
        data.json = await c.req.json().catch(() => null);
        raw = await c.req.text();
      } else if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
        data.form = await c.req.parseBody().catch(() => null);
        raw = await c.req.text();
      } else {
        raw = await c.req.text().catch(() => null);
        data.raw = raw;
      }
    }

    const payload: z.infer<typeof WebhooksParserBaseType> = {} as never;

    payload.id = randomChar(20);
    payload.method = method as never;
    payload.host = c.req.header("host");
    payload.referer = c.req.header("referer");
    payload.date = c.req.header("date") || new Date().toISOString();
    payload.size = Number(c.req.header("content-length") || Buffer.byteLength(raw || "", "utf8"));
    payload.data = data;

    this.client.emit("webhooks", payload);
  }
}
