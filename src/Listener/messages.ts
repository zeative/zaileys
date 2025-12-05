import makeWASocket, { downloadMediaMessage, getDevice, jidNormalizedUser, WAMessage, WAMessageAddressingMode } from 'baileys';
import z from 'zod';
import { Client } from '../Classes';
import { MESSAGE_MEDIA_TYPES } from '../Config/media';
import { store } from '../Modules/store';
import { ListenerMessagesType } from '../Types/messages';
import { extractUrls, findGlobalWord, normalizeText, pickKeysFromArray, toString } from '../Utils';
import { cleanJid, cleanMediaObject, generateId, getDeepContent, getUsersMentions } from '../Utils/message';
import { RateLimiter } from '../Modules/limiter';
import _ from 'lodash';

export class Messages {
  private limiter: RateLimiter;

  constructor(private client: Client) {
    this.limiter = new RateLimiter(client);

    this.initialize();
  }

  async initialize() {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;

    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const message of messages) {
        console.log(JSON.stringify(message, null, 2));

        const parsed = await this.parse(message);

        if (parsed) {
          await this.client.middleware.run({ messages: parsed });
          store.events.emit('messages', parsed);
        }
      }
    });
  }

  async parse(message: WAMessage) {
    if (message?.category === 'peer') return;
    if (!message?.message || !message?.key?.id) return;
    if (message?.messageStubType || !!message?.messageStubParameters) return;
    if (message?.message?.botInvokeMessage || message.message?.protocolMessage?.peerDataOperationRequestResponseMessage) return;
    if (message.message?.groupStatusMentionMessage) return;

    const original = message;

    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    const output: Partial<z.infer<typeof ListenerMessagesType>> = {};

    let contentExtract = getDeepContent(message.message);
    let contentType = contentExtract.chain.at(-1);
    let content = contentExtract.leaf;

    // console.log(JSON.stringify(content, null, 2));

    output.uniqueId = null;
    output.channelId = null;

    output.chatId = message?.message?.protocolMessage?.key?.id || message?.key?.id || null;
    output.chatAddress = message?.key?.addressingMode as WAMessageAddressingMode;
    output.chatType = MESSAGE_MEDIA_TYPES[contentType];

    output.receiverId = jidNormalizedUser(socket?.user?.id || '');
    output.receiverName = normalizeText(socket?.user?.name || socket?.user?.verifiedName);

    output.roomId = jidNormalizedUser(message?.key?.remoteJid);

    const isRevoke = content?.type === 0;
    const isPin = content?.type === 1;
    const isUnPin = content?.type === 2;

    const universalId = content?.key?.id;

    if (isRevoke || isPin || isUnPin) {
      const messages = await this.client.db('messages').get(output.roomId);
      const universal = messages?.find((item) => item.key.id === universalId);

      if (!universal) return;
      message = universal;

      contentExtract = getDeepContent(message.message);
      contentType = contentExtract.chain.at(-1);
      content = contentExtract.leaf;
    }

    const chat = await this.client.db('chats').get(output.roomId);
    const contact = await this.client.db('contacts').get(output.roomId);

    const chatName = pickKeysFromArray(chat, ['name', 'verifiedName']);
    const contactName = pickKeysFromArray(contact, ['notify', 'name']);

    output.roomName = chatName || contactName || null;

    output.senderLid = pickKeysFromArray([message?.key], ['remoteJidAlt', 'participant']);
    output.senderId = jidNormalizedUser(message?.participant || message?.key?.participant || message?.key?.remoteJid);
    output.senderLid = output.senderLid || output.senderId;

    output.senderName = normalizeText(message?.pushName || message?.verifiedBizName);
    output.senderDevice = getDevice(output.chatId);

    output.channelId = generateId([output.roomId, output.senderId]);
    output.uniqueId = generateId([output.channelId, output.chatId]);

    output.timestamp = Number(message?.messageTimestamp);

    output.text =
      content?.text ||
      content?.caption ||
      content?.name ||
      content?.displayName ||
      content?.conversation ||
      content?.contentText ||
      content?.selectedDisplayText ||
      content ||
      null;

    output.text = normalizeText(output.text);
    output.mentions = getUsersMentions(output.text);
    output.links = extractUrls(output.text || '');

    output.isFromMe = message?.key?.fromMe || false;
    output.isTagMe = output.mentions?.includes(output.receiverId.split('@')[0]);
    output.isPrefix = output.text?.startsWith(this.client.options?.prefix) || false;

    output.isSpam = await this.limiter.isSpam(output.channelId);

    output.isGroup = output.roomId?.includes('@g.us');
    output.isNewsletter = output.roomId?.includes('@newsletter');
    output.isStory = output.roomId?.includes('@broadcast');

    output.isViewOnce = false;
    output.isEdited = !!findGlobalWord(toString(contentExtract), 'editedMessage');
    output.isDeleted = isRevoke;
    output.isPinned = isPin;
    output.isUnPinned = isUnPin;

    output.isBroadcast = !!message?.broadcast;

    output.isEphemeral = !!findGlobalWord(toString(content?.contextInfo), 'ephemeralSettingTimestamp');
    output.isForwarded = !!findGlobalWord(toString(content?.contextInfo), 'forwardingScore');

    output.citation = null;

    if (this.client.options.citation) {
      output.citation = output.citation || {};
      const citation = this.client.options.citation;

      for (const key of Object.keys(citation)) {
        const method = citation[key];

        output.citation[key] = async () => {
          const result = await method();

          const compare = [cleanJid(output.roomId), cleanJid(output.senderLid), cleanJid(output.senderId)];
          return Boolean(_.intersection(compare, result).length);
        };
      }
    }

    if (output.chatType !== 'text') {
      output.media = {
        ...cleanMediaObject(content),
        buffer: () => downloadMediaMessage(message, 'buffer', {}) as Promise<Buffer>,
        stream: () => downloadMediaMessage(message, 'stream', {}) as Promise<NodeJS.ReadableStream>,
      };
    }

    output.message = () => original;

    output.replied = null;

    const isReplied = content?.contextInfo?.quotedMessage;
    const isViewOnce = pickKeysFromArray([isReplied], ['viewOnceMessageV2Extension', 'viewOnceMessage']);

    const repliedId = content?.contextInfo?.stanzaId;

    if (isReplied) {
      const messages = await this.client.db('messages').get(output.roomId);
      const replied = messages?.find((item) => item.key.id === repliedId);

      const viewonce = {
        ...replied,
        ...getDeepContent(isViewOnce).leaf,
      };

      if (isViewOnce) {
        output.replied = (await this.parse(viewonce)) as never;
        output.replied.isViewOnce = true;
      } else {
        output.replied = (await this.parse(replied)) as never;
      }
    }

    return output;
  }
}
