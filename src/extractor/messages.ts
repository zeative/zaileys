import { downloadMediaMessage, getContentType, getDevice, jidNormalizedUser, proto, toNumber } from "baileys";
import _ from "lodash";
import { Listener } from "../classes/Listener";
import { LimiterHandler } from "../modules/limiter";
import { ExtractorMessagesType, MessagesMediaType } from "../types/extractor/messages";
import { ExtractZod } from "../types/general";
import { extractUrls, findWord, getMentions, normalizeText, toJson, toString } from "../utils/helpers";

export const MessagesExtractor = async (client: Listener["client"], message: proto.IWebMessageInfo) => {
  let MAX_REPLIES = 0;
  const CLONE = message;

  const extract = async (obj: proto.IWebMessageInfo, isReplied?: boolean, isExtract?: boolean) => {
    let msg = toJson(obj);

    // if (msg) {
    //   console.log(JSON.stringify(msg, null, 2))
    // }

    if (!msg.message || !msg?.key?.id) return null;
    if (msg?.messageStubType || !!msg?.messageStubParameters || msg?.message?.botInvokeMessage || msg.message?.protocolMessage?.peerDataOperationRequestResponseMessage) return null;
    if (msg?.key?.fromMe && !msg?.participant && msg?.key?.remoteJid != "status@broadcast" && client.props?.ignoreMe && !MAX_REPLIES && !isExtract) return null;

    const pinId = msg?.message?.pinInChatMessage?.key?.id;
    const isPinned = msg?.message?.pinInChatMessage?.type == 1;
    const isUnPinned = msg?.message?.pinInChatMessage?.type == 2;

    if (pinId) {
      const read = await client.db.store("messages").read(pinId);
      msg = read;
    }

    const protocolId = !msg?.message?.protocolMessage?.editedMessage && msg?.message?.protocolMessage?.key?.id;
    const isDeleted = !!protocolId;

    if (protocolId) {
      const read = await client.db.store("messages").read(protocolId);
      msg = read;
    }

    let edited = msg?.message?.protocolMessage?.editedMessage || msg?.message?.editedMessage;

    if (edited) {
      const id = edited?.message?.protocolMessage?.key?.id;
      const read = await client.db.store("messages").read(id);

      const editType = getContentType(edited?.message?.protocolMessage?.editedMessage);
      const readType = getContentType(read?.message);

      const editing = edited?.message?.protocolMessage?.editedMessage[editType];

      if (read?.message) {
        if (typeof editing == "string") {
          read.message[readType] = _.merge(read.message[readType], {
            text: editing,
          });
        } else {
          read.message[readType] = _.merge(read.message[readType], editing);
        }
      }

      msg = read;
    }

    let contentType = getContentType(msg?.message?.protocolMessage?.editedMessage || msg?.message!);
    if (!contentType) return null;

    let payload: ExtractZod<typeof ExtractorMessagesType> = {} as never;

    payload.chatId = msg?.message?.protocolMessage?.key?.id || msg?.key?.id!;
    payload.channelId = "";
    payload.uniqueId = "";

    payload.receiverId = jidNormalizedUser(client.socket.user?.id);
    payload.receiverName = client.socket.user?.name || client.socket.user?.verifiedName || null;

    payload.roomId = jidNormalizedUser(message?.key?.remoteJid!);

    const roomName = await client.db.store("chats").read(payload.roomId);
    payload.roomName = toJson(roomName)?.name;

    payload.senderLid = msg?.message?.protocolMessage?.key?.senderLid || msg?.key?.senderLid || msg?.key?.participantLid || null;
    payload.senderId = jidNormalizedUser(msg?.participant || msg?.key?.participant || msg?.key?.remoteJid);

    const senderName = await client.db.store("chats").read(payload.senderId);
    payload.senderLid = payload.senderLid || toJson(senderName)?.lidJid || null;

    payload.senderName = msg?.pushName || msg?.verifiedBizName || toJson(senderName)?.name || payload.receiverName;
    payload.senderDevice = getDevice(payload.chatId);

    if (payload.senderId == payload.receiverId) {
      payload.senderName = payload.receiverName;
    }

    payload.roomName = payload.roomName || payload.senderName || payload.roomId.split("@")[0];

    payload.chatType = MessagesMediaType[contentType! as never];
    payload.timestamp = toNumber(msg?.messageTimestamp || 0);

    payload.text = null;
    payload.mentions = [];
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
      const limiter = await LimiterHandler(payload.roomId, client.props.limiter?.maxMessages, client.props.limiter?.durationMs);
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

    const citation = client.props?.citation || [];
    if (Object.keys(citation!).length) {
      payload.citation = {};
      for (const key of Object.keys(citation!)) {
        const slug = "is" + _.upperFirst(_.camelCase(key));
        payload.citation[slug] = citation![key].includes(Number(payload.senderId.split("@")[0]!)) || citation![key].includes(Number(payload.roomId.split("@")[0]!));
      }
    }

    const media = msg?.message?.editedMessage?.[contentType] || msg?.message?.protocolMessage?.editedMessage?.[contentType] || msg?.message?.[contentType!]?.message?.documentMessage || msg?.message?.[contentType!];

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
        buffer: async () => await downloadMediaMessage(message, "buffer", {}),
        stream: async () => await downloadMediaMessage(message, "stream", {}),
      };
    }

    const repliedId = toJson(msg?.message?.[contentType])?.contextInfo?.stanzaId;

    if (repliedId && MAX_REPLIES < 1) {
      MAX_REPLIES++;
      const replied = await client.db.store("messages").read(repliedId);

      if (!replied) {
        const type = toJson(getContentType(msg.message?.extendedTextMessage?.contextInfo.quotedMessage));

        msg.key.id = msg.message?.extendedTextMessage?.contextInfo.stanzaId;
        msg.message[type] = msg.message?.extendedTextMessage?.contextInfo.quotedMessage[type];
        delete msg.message?.extendedTextMessage;

        payload.replied = await extract(msg, true);
      } else {
        payload.replied = await extract(replied, true);
      }

      MAX_REPLIES = 0;
    }

    const text = typeof media == "string" ? media : media?.text || media?.caption || media?.name || media?.displayName || media?.conversation || media?.contentText || media?.selectedDisplayText || "";

    payload.text = normalizeText(text) || null;
    payload.mentions = getMentions(payload.text);
    payload.links = extractUrls(payload.text);

    const messaging = toJson(msg?.message?.[contentType]);

    payload.isPrefix = !!client.props?.prefix && !!payload.text?.startsWith(client.props?.prefix!)!;
    payload.isTagMe = payload.mentions.includes(payload.receiverId.split("@")[0]!);
    payload.isEdited = !!edited;
    payload.isEphemeral = !!findWord(toString(messaging?.contextInfo), "ephemeralSettingTimestamp")!;
    payload.isForwarded = !!findWord(toString(messaging?.contextInfo), "forwardingScore")!;
    payload.isViewOnce = !!messaging?.viewOnce;

    if (payload.isPrefix) {
      payload.text = payload.text!.replace(new RegExp(`^${client.props?.prefix}`), "");
    }

    payload.message = () => CLONE;

    return payload;
  };

  return extract(message);
};
