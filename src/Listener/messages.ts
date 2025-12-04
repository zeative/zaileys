import makeWASocket, {
  extractMessageContent,
  getContentType,
  getDevice,
  jidNormalizedUser,
  normalizeMessageContent,
  WAMessage,
  WAMessageAddressingMode,
} from 'baileys';
import z from 'zod';
import { Client } from '../Classes';
import { MESSAGE_MEDIA_TYPES } from '../Config/media';
import { store } from '../Modules/store';
import { ListenerMessagesType } from '../Types/messages';
import { generateId, normalizeText, pickKeysFromArray } from '../Utils';

export class Messages {
  constructor(private client: Client) {
    if (store.get('connection')?.status != 'syncing') {
      this.initialize();
    }
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
    // console.log(JSON.stringify(message, null, 2));

    if (message?.category === 'peer') return;
    if (!message.message || !message?.key?.id) return;
    if (message?.messageStubType || !!message?.messageStubParameters) return;
    if (message?.message?.botInvokeMessage || message.message?.protocolMessage?.peerDataOperationRequestResponseMessage) return;

    const original = message;

    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    const output: Partial<z.infer<typeof ListenerMessagesType>> = {};

    const contentType = getContentType(message?.message?.protocolMessage?.editedMessage || message?.message);
    const contentExtract = extractMessageContent(message.message);

    console.log('🔍 ~ parse ~ src/Listener/messages.ts:54 ~ normalize:', JSON.stringify(contentExtract, null, 2));

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

    output.senderLid = message?.key?.remoteJidAlt || null;
    output.senderId = jidNormalizedUser(message?.participant || message?.key?.participant || message?.key?.remoteJid);
    output.senderName = normalizeText(message?.pushName || message?.verifiedBizName);
    output.senderDevice = getDevice(output.chatId);

    output.channelId = generateId([output.roomId, output.senderId]);
    output.uniqueId = generateId([output.channelId, output.chatId]);

    output.timestamp = Number(message?.messageTimestamp);

    output.text = null;
    output.mentions = [];
    output.links = [];

    output.isPrefix = false;
    output.isSpam = false;

    output.isFromMe = message?.key?.fromMe || false;
    output.isTagMe = false;

    output.isGroup = output.roomId?.includes('@g.us');
    output.isNewsletter = output.roomId?.includes('@newsletter');
    output.isStory = output.roomId?.includes('@broadcast');

    output.isViewOnce = false;
    output.isEdited = false;
    output.isDeleted = false;
    output.isPinned = false;
    output.isUnPinned = false;

    output.isBroadcast = !!message?.broadcast;

    output.isEphemeral = false;
    output.isForwarded = false;

    output.citation = {};

    output.media = null;
    output.message = () => original;
    output.replied = null;

    return output;
  }
}
