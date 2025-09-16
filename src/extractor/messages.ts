import { downloadMediaMessage, getContentType, jidNormalizedUser, proto } from "baileys";
import _ from "lodash";
import { MessagesMediaType } from "../types/extractor/messages";
import { ExtractZod } from "../types/general";
import { LimiterHandler } from "../modules/limiter";
import { extractUrls, findWord, getMentions, getDevice, normalizeText, toJson, toString } from "../utils/helpers";
import { Client } from "../classes/Client";
import { JsonDBInterface } from "../plugins/JsonDB";
import { ExtractorMessagesType } from "../types/extractor/messages";

export const MessagesExtractor = async (client: Client & { db: JsonDBInterface }, message: proto.IWebMessageInfo) => {
  let MAX_REPLIES = 0;
  const CLONE = message;

  const extract = async (obj: proto.IWebMessageInfo, isReplied?: boolean, isExtract?: boolean) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let msg: any = toJson(obj);

    // if (msg) {
    //   console.log(JSON.stringify(msg, null, 2))
    // }

    if (!msg.message || !msg?.key?.id) return null;
    if (msg?.messageStubType || !!msg?.messageStubParameters || msg?.message?.botInvokeMessage || msg.message?.protocolMessage?.peerDataOperationRequestResponseMessage) return null;
    if (msg?.key?.fromMe && !msg?.participant && msg?.key?.remoteJid != "status@broadcast" && client.props?.ignoreMe && !MAX_REPLIES && !isExtract) return null;

    const pinId = msg?.message?.pinInChatMessage?.key?.id;
    const isPinned = msg?.message?.pinInChatMessage?.type == 1;
    const isUnPinned = msg?.message?.pinInChatMessage?.type == 2;

    if (pinId && client.db) {
      const read = await client.db.store("messages").read(pinId) as typeof msg;
      msg = read;
    }

    const protocolId = !msg?.message?.protocolMessage?.editedMessage && msg?.message?.protocolMessage?.key?.id;
    const isDeleted = !!protocolId;

    if (protocolId && client.db) {
      const read = await client.db.store("messages").read(protocolId) as typeof msg;
      msg = read;
    }

    const edited = msg?.message?.protocolMessage?.editedMessage || msg?.message?.editedMessage;

    if (edited) {
      const id = edited?.message?.protocolMessage?.key?.id;
      if (id && client.db) {
        const read3 = await client.db.store("messages").read(id) as typeof msg | null;

        const editType = getContentType(edited?.message?.protocolMessage?.editedMessage);
        const readType = getContentType((read3 as typeof msg)?.message);

        let editing: Record<string, unknown> | string | undefined = undefined;
        if (editType && edited?.message?.protocolMessage?.editedMessage) {
          editing = edited.message.protocolMessage.editedMessage[editType];
          if (readType && (read3 as typeof msg)?.message) {
            (read3 as typeof msg).message[readType] = _.merge((read3 as typeof msg).message[readType], editing);
          }
        }

        msg = (read3 || msg) as typeof msg;
      }
    }

    const contentType = getContentType(msg?.message?.protocolMessage?.editedMessage || msg?.message);
    if (!contentType) return null;

    const payload: ExtractZod<typeof ExtractorMessagesType> = {} as never;

    payload.chatId = (msg?.message?.protocolMessage?.key?.id as string) || (msg?.key?.id as string) || "";
    payload.channelId = "";
    payload.uniqueId = "";

    payload.receiverId = jidNormalizedUser(client.socket?.user?.id || "");
    payload.receiverName = (client.socket?.user?.name || client.socket?.user?.verifiedName || "") as string;

    payload.roomId = jidNormalizedUser((message?.key?.remoteJid as string) || "");

    if (client.db) {
      const roomName = await client.db.store("chats").read(payload.roomId);
      payload.roomName = (toJson(roomName) as { name?: string })?.name as string || "";
    }

    payload.senderLid = (msg?.message?.protocolMessage?.key?.senderLid as string) || (msg?.key?.senderLid as string) || (msg?.key?.participantLid as string) || "";
    payload.senderId = jidNormalizedUser((msg?.participant as string) || (msg?.key?.participant as string) || (msg?.key?.remoteJid as string));

    if (client.db) {
      const senderName = await client.db.store("chats").read(payload.senderId);
      payload.senderLid = payload.senderLid || (toJson(senderName) as { lidJid?: string })?.lidJid || "";

      payload.senderName = msg?.pushName || msg?.verifiedBizName || (toJson(senderName) as { name?: string })?.name || payload.receiverName;
    }
    payload.senderDevice = getDevice(payload.chatId);

    if (payload.senderId == payload.receiverId) {
      payload.senderName = payload.receiverName;
    }

    payload.roomName = payload.roomName || payload.senderName || (payload.roomId || "").split("@")[0];

    payload.chatType = MessagesMediaType[contentType as never];
    payload.timestamp = Number(msg?.messageTimestamp || 0);

    payload.text = null;
    payload.mentions = [];
    payload.links = [];

    payload.isPrefix = false;
    payload.isSpam = false;
    payload.isFromMe = message?.key?.fromMe || false;
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
    if (Object.keys(citation!).length) {
      payload.citation = {};
      for (const key of Object.keys(citation!)) {
        const slug = "is" + _.upperFirst(_.camelCase(key));
        const citationEntry = (citation as Record<string, unknown>)[key];
        if (citationEntry && Array.isArray(citationEntry)) {
          const senderId = payload.senderId.split("@")[0];
          const roomId = payload.roomId.split("@")[0];
          // Add type assertion to fix indexing error
          const citationRecord = citation as Record<string, number[]>;
          payload.citation[slug] = 
            (senderId ? (citationRecord[key] || []).includes(Number(senderId)) : false) || 
            (roomId ? (citationRecord[key] || []).includes(Number(roomId)) : false);
        }
      }
    }

    const media = (msg?.message?.editedMessage?.[contentType] as Record<string, unknown>) || (msg?.message?.protocolMessage?.editedMessage?.[contentType] as Record<string, unknown>) || (msg?.message?.[contentType!]?.message?.documentMessage as Record<string, unknown>) || (msg?.message?.[contentType!] as Record<string, unknown>);

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
          "midQualityFileSha256",
        ]),
        buffer: () => downloadMediaMessage(message, "buffer", {}) as Promise<Buffer>,
        stream: () => downloadMediaMessage(message, "stream", {}) as Promise<NodeJS.ReadableStream>,
      };
    }

    const repliedId = (toJson(msg?.message?.[contentType]) as { contextInfo?: { stanzaId?: string } })?.contextInfo?.stanzaId;

    if (repliedId && MAX_REPLIES < 1 && client.db) {
      MAX_REPLIES++;
      const replied = await client.db.store("messages").read(repliedId);

      if (!replied) {
        payload.replied = await extract(msg as proto.IWebMessageInfo, true);
      } else {
        payload.replied = await extract(replied as proto.IWebMessageInfo, true);
      }

      MAX_REPLIES = 0;
    }

    const text = (typeof media == "string" ? media : media?.text || media?.caption || media?.name || media?.displayName || media?.conversation || media?.contentText || media?.selectedDisplayText || "") as string;

    payload.text = normalizeText(text) || "";
    payload.mentions = getMentions((payload.text || "") as string);
    payload.links = extractUrls((payload.text || "") as string);

    const messaging = toJson(msg?.message?.[contentType]) as Record<string, unknown>;

    payload.isPrefix = !!(client.props?.prefix && payload.text?.startsWith(client.props?.prefix));
    payload.isTagMe = payload.mentions.includes(payload.receiverId.split("@")[0] || "");
    payload.isEdited = !!edited;
    payload.isEphemeral = !!findWord(toString((messaging as { contextInfo?: unknown })?.contextInfo), "ephemeralSettingTimestamp");
    payload.isForwarded = !!findWord(toString((messaging as { contextInfo?: unknown })?.contextInfo), "forwardingScore");
    payload.isViewOnce = !!(messaging as { viewOnce?: boolean })?.viewOnce;

    if (payload.isPrefix) {
      payload.text = payload.text!.replace(new RegExp(`^${client.props?.prefix}`), "");
    }

    payload.message = () => CLONE;

    return payload;
  };

  return extract(message);
};
