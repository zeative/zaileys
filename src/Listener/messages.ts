import makeWASocket, { downloadMediaMessage, getDevice, jidNormalizedUser, WAMessage, WAMessageAddressingMode } from 'baileys';
import z from 'zod';
import { Client } from '../Classes';
import { MESSAGE_MEDIA_TYPES } from '../Config/media';
import { store } from '../Modules/store';
import { ListenerMessagesType } from '../Types/messages';
import { extractUrls, findGlobalWord, normalizeText, pickKeysFromArray, toString } from '../Utils';
import { cleanMediaObject, generateId, getDeepContent, getUsersMentions } from '../Utils/message';
import { RateLimiter } from '../Modules/limiter';

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
        const parsed = await this.parse(message);

        if (parsed) {
          await this.client.middleware.run({ messages: parsed });
          store.events.emit('messages', parsed);
        }
      }
    });
  }

  async parse(message: WAMessage) {
    console.log(JSON.stringify(message, null, 2));

    if (message?.category === 'peer') return;
    if (!message.message || !message?.key?.id) return;
    if (message?.messageStubType || !!message?.messageStubParameters) return;
    if (message?.message?.botInvokeMessage || message.message?.protocolMessage?.peerDataOperationRequestResponseMessage) return;

    const original = message;

    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    const output: Partial<z.infer<typeof ListenerMessagesType>> = {};

    const contentExtract = getDeepContent(message.message);
    const contentType = contentExtract.chain.at(-1);
    const content = contentExtract.leaf;

    // console.log(content);

    output.uniqueId = null;
    output.channelId = null;

    output.chatId = message?.message?.protocolMessage?.key?.id || message?.key?.id || null;
    output.chatAddress = message?.key?.addressingMode as WAMessageAddressingMode;
    output.chatType = MESSAGE_MEDIA_TYPES[contentType];

    output.receiverId = jidNormalizedUser(socket?.user?.id || '');
    output.receiverName = normalizeText(socket?.user?.name || socket?.user?.verifiedName);

    output.roomId = jidNormalizedUser(message?.key?.remoteJid);

    const chat = await this.client.db('chats').get(output.roomId);
    const contact = await this.client.db('contacts').get(output.roomId);

    const chatName = pickKeysFromArray(chat, ['name', 'verifiedName']);
    const contactName = pickKeysFromArray(contact, ['notify', 'name']);

    output.roomName = chatName || contactName || null;

    output.senderLid = pickKeysFromArray([message?.key], ['remoteJidAlt', 'participant']);
    output.senderId = jidNormalizedUser(message?.participant || message?.key?.participant || message?.key?.remoteJid);
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
    output.isPrefix = output.text?.startsWith(this.client.options?.prefix);

    output.isSpam = await this.limiter.isSpam(output.channelId);

    output.isGroup = output.roomId?.includes('@g.us');
    output.isNewsletter = output.roomId?.includes('@newsletter');
    output.isStory = output.roomId?.includes('@broadcast');

    output.isViewOnce = false;
    output.isEdited = false;
    output.isDeleted = false;
    output.isPinned = false;
    output.isUnPinned = false;

    output.isBroadcast = !!message?.broadcast;

    output.isEphemeral = !!findGlobalWord(toString(message.message), 'ephemeralSettingTimestamp');
    output.isForwarded = !!findGlobalWord(toString(message.message), 'forwardingScore');

    output.citation = {};

    if (output.chatType !== 'text') {
      output.media = {
        ...cleanMediaObject(content),
        buffer: () => downloadMediaMessage(message, 'buffer', {}) as Promise<Buffer>,
        stream: () => downloadMediaMessage(message, 'stream', {}) as Promise<NodeJS.ReadableStream>,
      };
    }

    output.message = () => original;
    output.replied = null;

    return output;
  }
}
