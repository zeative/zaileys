import makeWASocket, { downloadMediaMessage, getDevice, proto, WABusinessProfile } from "@whiskeysockets/baileys";
import { Client } from "../Modules/Client";
import { MESSAGE_TYPE } from "../Modules/Config";
import { compareValue, removeKeys } from "../Modules/Utils";
import { ExtractCitationType, MessageBaseContent } from "../Types/Message";

interface MessageConfig {
  message: proto.IWebMessageInfo;
  socket: ReturnType<typeof makeWASocket>;
  config: Client["config"];
  store: Client["store"];
}

export class MessageParser {
  private socket: ReturnType<typeof makeWASocket>;
  private message: proto.IWebMessageInfo;
  private config: Client["config"];
  private store: Client["store"];

  constructor({ socket, message, config, store }: MessageConfig) {
    this.socket = socket;
    this.message = message;
    this.config = config;
    this.store = store;
  }

  async handle<T>(payload?: proto.IWebMessageInfo): Promise<MessageBaseContent<T> | undefined> {
    const data = removeKeys(payload || this.message, ["senderKeyDistributionMessage", "messageContextInfo"]);
    if (data?.messageStubType || !Object.keys(data?.message).length) return;

    const messageData = data.ephemeralMessage || data;
    const isExtended = !!messageData.message?.extendedTextMessage;
    const isEdited = !!messageData.message?.protocolMessage?.editedMessage;
    const isBotInvoked = !!messageData.message?.botInvokeMessage;

    const chatEdited = messageData.message?.protocolMessage?.editedMessage?.extendedTextMessage || messageData.message?.protocolMessage?.editedMessage;
    const originalType = isExtended
      ? Object.keys(messageData.message.extendedTextMessage)[0]
      : isEdited
        ? Object.keys(chatEdited)[0]
        : isBotInvoked
          ? Object.keys(messageData.message.botInvokeMessage.message.extendedTextMessage)[0]
          : Object.keys(messageData.message)[0];

    const chatRepliedId = isExtended ? messageData.message?.extendedTextMessage?.contextInfo?.stanzaId : messageData.message?.[originalType]?.contextInfo?.stanzaId;

    let chatType = MESSAGE_TYPE[originalType];
    if (messageData.message?.protocolMessage?.ephemeralExpiration) chatType = "ephemeral";

    const extract = isExtended
      ? messageData.message.extendedTextMessage[originalType]
      : isEdited
        ? chatEdited[originalType]
        : isBotInvoked
          ? messageData.message.botInvokeMessage.message.extendedTextMessage[originalType]
          : messageData.message[originalType];

    const text = typeof extract === "string" ? extract : extract?.caption || extract?.text || extract?.name || null;
    const mentions = text?.match(/@\d+/g) || null;

    const structure: MessageBaseContent<T> = {
      fromMe: messageData.key.fromMe,
      channelId: '',
      chatId: messageData.key.id,
      roomId: messageData.key.remoteJid,
      roomImage: async () => (await this.socket.profilePictureUrl(messageData.key.remoteJid, "image").catch(() => null)) as string | null,
      senderId: messageData.participant || messageData.key.participant || messageData.key.remoteJid,
      senderName: messageData.pushName || messageData.verifiedBizName || null,
      senderDevice: getDevice(messageData.key.id),
      senderBio: async () =>
        await this.socket
          .fetchStatus(messageData.key.participant || messageData.key.remoteJid)
          .then((x: any) => x?.[0]?.status?.status)
          .catch(() => null),
      senderImage: async () => {
        const result = await this.socket.profilePictureUrl(messageData.key.participant || messageData.key.remoteJid, "image").catch(() => null);
        return result === undefined ? null : result;
      },
      senderBusiness: async () => (await this.socket.getBusinessProfile(messageData.key.participant || messageData.key.remoteJid).catch(() => null)) as WABusinessProfile,
      chatType,
      timestamp: Number((messageData.messageTimestamp.low || messageData.messageTimestamp || 0).toString()),
      text,
      command: text?.startsWith(this.config.prefix) ? text.split(" ")[0]?.slice(1) : null,
      mentions,
      isTagMe: !!text?.match(`@${this.socket.user?.id?.split(":")[0]}`),
      isGroup: messageData.key.remoteJid.endsWith("@g.us"),
      isStory: messageData.key.remoteJid.endsWith("@broadcast"),
      isEdited,
      isChannel: messageData.key.remoteJid.endsWith("@newsletter"),
      isBroadcast: !!messageData.broadcast,
      isEphemeral: chatType === "ephemeral" || !!messageData.message?.extendedTextMessage?.contextInfo?.expiration,
      isForwarded: !!messageData.message?.extendedTextMessage?.contextInfo?.isForwarded,
      citation: {} as ExtractCitationType<T>,
      media: typeof extract !== "string" ? extract : null,
      reply: null,
      key: () => messageData.key,
      message: () => this.message,
    };

    structure.channelId = `${structure.roomId?.split("@")[0]}-${structure.senderId?.split("@")[0]}`

    if (structure.media) {
      structure.media = {
        ...structure.media,
        ...((structure.media.url || messageData.message?.extendedTextMessage?.jpegThumbnail || messageData.message?.newsletterAdminInviteMessage || messageData.message?.orderMessage) && {
          buffer: async () => await downloadMediaMessage(this.message, "buffer", {}).catch(() => null),
          stream: async () => await downloadMediaMessage(this.message, "stream", {}).catch(() => null),
        }),
      };

      structure.media =
        removeKeys(structure.media, [
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
        ]) || null;
    }

    if (this.config.citation) {
      const jidMapping = [structure.roomId?.split("@")[0], structure.senderId?.split("@")[0]];
      for (const key of Object.keys(this.config.citation!)) {
        const citationKey = `is${key[0].toUpperCase()}${key.slice(1)}`;
        const output = await this.config.citation![key]();
        structure.citation = { ...(structure.citation || {}), [citationKey]: compareValue(output, jidMapping) } as never;
      }
    }

    if (chatRepliedId) {
      const chatRepliedRoom = this.store.messages[structure.roomId]?.get(chatRepliedId);
      const chatRepliedSender = this.store.messages[structure.senderId]?.get(chatRepliedId);

      if (!chatRepliedRoom && !chatRepliedSender) return structure;

      structure.reply = (await this.handle(chatRepliedRoom || chatRepliedSender)) as never;
    }

    return structure;
  }
}
