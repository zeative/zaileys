import makeWASocket, { downloadMediaMessage, getDevice, jidNormalizedUser, WAMessage } from 'baileys';
import _ from 'lodash';
import { Client } from '../Classes';
import { MESSAGE_MEDIA_TYPES } from '../Config/media';
import { RateLimiter } from '../Modules/limiter';
import { store } from '../Modules/store';
import { MessagesContext } from '../Types/messages';
import { extractUrls, findGlobalWord, ignoreLint, normalizeText, pickKeysFromArray, toJson, toString } from '../Utils';
import { cleanJid, cleanMediaObject, generateId, getDeepContent, getUsersMentions } from '../Utils/message';

export class Messages {
  private limiter: RateLimiter;
  private maxReplies = 3;

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
          const collected = this.client.collector.push(parsed);

          if (!collected) {
            await this.client.middleware.run({ messages: parsed });
            await this.client.plugins.execute(this.client, { messages: parsed });

            store.set('message', parsed);
            store.events.emit('messages', parsed);
          }

          if (this.client.options.autoRead) {
            await socket.readMessages([parsed.message().key]);
          }
        }
      }
    });
  }

  async parse(message: WAMessage, type?: 'replied') {
    if (message?.category === 'peer') return;
    if (!message?.message || !message?.key?.id) return;
    if (message?.messageStubType || !!message?.messageStubParameters?.length) return;
    if (message.message?.protocolMessage?.peerDataOperationRequestResponseMessage) return;
    if (message.message?.groupStatusMentionMessage) return;

    const original = message;

    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    const output: Partial<MessagesContext> = {};

    let contentExtract = getDeepContent(message.message);
    let contentType = contentExtract.chain.at(-1);
    let content = contentExtract.leaf;

    if (content?.message) {
      contentExtract = getDeepContent(content.message);
      contentType = contentExtract.chain.at(-1);
      content = contentExtract.leaf;
    }

    output.uniqueId = null;
    output.channelId = null;

    output.chatId = message?.message?.protocolMessage?.key?.id || message?.key?.id || null;
    output.chatType = MESSAGE_MEDIA_TYPES[contentType];

    output.receiverId = jidNormalizedUser(socket?.user?.id || '');
    output.receiverName = normalizeText(socket?.user?.name || socket?.user?.verifiedName);

    output.roomId = jidNormalizedUser(message?.key?.remoteJid);

    const isRevoke = content?.type === 0;
    const isPin = content?.type === 1;
    const isUnPin = content?.type === 2;

    const isNewsletter = output.roomId?.includes('@newsletter');
    const isQuestion = !!message?.message?.questionMessage;
    const isFromMe = message?.key?.fromMe || false;

    if (isFromMe && this.client.options.ignoreMe && type !== 'replied') return;

    const universalId = content?.key?.id;

    if (isRevoke || isPin || isUnPin) {
      // Use query builder for optimized lookup
      const universal = await this.client.db('messages').query(output.roomId).where('key.id', '=', universalId).first();

      if (!universal) return;
      message = universal;

      contentExtract = getDeepContent(message.message);
      contentType = contentExtract.chain.at(-1);
      content = contentExtract.leaf;
    }

    output.roomName = await this.client.getRoomName(output.roomId);

    output.senderLid = pickKeysFromArray([message?.key], ['remoteJidAlt', 'participant']) || null;
    output.senderId = jidNormalizedUser(message?.participant || message?.key?.participant || message?.key?.remoteJid);

    output.senderName = normalizeText(message?.pushName || message?.verifiedBizName);
    output.senderDevice = getDevice(output.chatId);

    output.channelId = generateId([output.roomId, output.senderId]);
    output.uniqueId = generateId([output.channelId, output.chatId]);

    output.timestamp = Number(message?.messageTimestamp) * 1000;

    if (isNewsletter) {
      const meta = await socket.newsletterMetadata('jid', output.roomId);

      output.roomName = ignoreLint(meta.thread_metadata.name)?.text;
      output.senderId = null;
      output.senderLid = null;
    }

    if (isFromMe) {
      output.senderLid = jidNormalizedUser(socket.user.lid);
      output.senderId = output.receiverId;
      output.senderName = output.receiverName;
    }

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

    if (content?.name == 'menu_options') {
      output.text = toJson(content?.paramsJson)?.id;
    }

    output.text = normalizeText(output.text);
    output.mentions = getUsersMentions(output.text);
    output.links = extractUrls(output.text || '');

    output.isBot = output.chatId.startsWith('BAE5') || output.chatId.startsWith('3EB0') || output.chatId.startsWith('Z4D3FC');
    output.isFromMe = isFromMe;
    output.isTagMe = output.mentions?.includes(output.receiverId.split('@')[0]);
    output.isPrefix = output.text?.startsWith(this.client.options?.prefix) || false;

    output.isSpam = await this.limiter.isSpam(output.channelId);

    if (output.isPrefix) {
      output.text = output.text.replace(new RegExp(`^${this.client.options?.prefix}`), '');
    }

    output.isGroup = output.roomId?.includes('@g.us');
    output.isNewsletter = isNewsletter;
    output.isQuestion = isQuestion;
    output.isStory = output.roomId?.includes('@broadcast');

    if (!output.isGroup && !output.roomName) {
      output.roomName = output.senderName;
    }

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
        buffer: () => downloadMediaMessage(message, 'buffer', {}),
        stream: () => downloadMediaMessage(message, 'stream', {}),
      };
    }

    output.message = () => original;

    output.replied = null;

    const isReplied = content?.contextInfo?.quotedMessage;

    let isViewOnce = pickKeysFromArray([isReplied], ['viewOnceMessageV2Extension', 'viewOnceMessage']);
    isViewOnce = findGlobalWord(toString(isReplied), 'viewOnce') ? isReplied : isViewOnce;

    const repliedId = content?.contextInfo?.stanzaId;

    if (isReplied && this.maxReplies) {
      this.maxReplies--;

      // Use query builder for optimized lookup
      const replied = await this.client.db('messages').query(output.roomId).where('key.id', '=', repliedId).first();

      const viewonce = {
        ...replied,
        message: isViewOnce,
      };

      if (isViewOnce) {
        output.replied = (await this.parse(viewonce, 'replied')) as never;
        output.replied.isViewOnce = true;
      } else {
        output.replied = (await this.parse(replied, 'replied')) as never;
      }

      this.maxReplies = 3;
    }

    if (type != 'replied') {
      this.client.logs.message(output);
    }

    return output;
  }
}
