import makeWASocket, { downloadMediaMessage, getDevice, jidNormalizedUser, WAMessage } from 'baileys';
import * as _ from 'radashi';
import { Client } from '../Classes';
import { MESSAGE_MEDIA_TYPES } from '../Config/media';
import { store, contextStore, centerStore } from '../Store';
import { fireForget, Priority } from '../Library/fire-forget';
import { RateLimiter } from '../Library/rate-limiter';
import { MessagesContext } from '../Types/messages';
import { escapeRegExp, extractUrls, findGlobalWord, ignoreLint, normalizeText, toJson, toString } from '../Utils';
import { cleanJid, cleanMediaObject, generateId, getDeepContent, getUsersMentions } from '../Utils/message';

export class Messages {
  private limiter: RateLimiter;
  private maxReplies: number;

  constructor(private client: Client) {
    this.limiter = new RateLimiter(client);
    this.maxReplies = this.client.options?.maxReplies ?? 3;
    this.initialize();
  }

  async initialize() {
    const socket = centerStore.get('socket') as ReturnType<typeof makeWASocket>;

    if (!socket?.ev) {
      console.warn('⚠️ [Messages] Socket or socket.ev is not available during initialization');
      return;
    }

    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      try {
        if (type !== 'notify' && type !== 'append') return;

        for (const message of messages) {
          try {
            const parsed = await this.parse(message);

            if (parsed) {
              fireForget.add(async () => {
                await Promise.all([
                  this.client.middleware.run({ messages: parsed }),
                  this.client.plugins.execute(this.client, { messages: parsed }),
                ]);
              }, { priority: Priority.NORMAL, timeout: 5000 });

              centerStore.set('message', parsed);
              store.events.emit('messages', parsed);

              if (this.client.options.autoRead) {
                fireForget.add(async () => socket.readMessages([parsed.message().key]), { priority: Priority.NORMAL, timeout: 5000 });
              }
            }
          } catch {}
        }
      } catch {}
    });
  }

  async parse(message: WAMessage, type?: 'replied') {
    // console.log(JSON.stringify(message, null, 2)/*  */)

    if (message?.category === 'peer') return;
    if (!message?.message || !message?.key?.id) return;
    if (message?.messageStubType || !!message?.messageStubParameters?.length) return;
    if (message.message?.protocolMessage?.peerDataOperationRequestResponseMessage) return;

    const original = message;

    const socket = centerStore.get('socket') as ReturnType<typeof makeWASocket>;
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

    if (!output.chatType) return;

    const r1 = jidNormalizedUser(socket?.user?.lid || '');
    const r2 = jidNormalizedUser(socket?.user?.id || '');

    output.receiverLid = r1.includes('@lid') ? r1 : r2.includes('@lid') ? r2 : null;
    output.receiverId = r1.includes('@s.whatsapp.net') ? r1 : r2.includes('@s.whatsapp.net') ? r2 : null;
    output.receiverName = normalizeText(socket?.user?.name || socket?.user?.verifiedName);

    output.roomId = r1.includes('@s.whatsapp.net') && !output.isGroup ? r1 : jidNormalizedUser(message?.key?.remoteJid);
    output.roomLid = r1.includes('@lid') ? r1 : null;

    const isRevoke = content?.type === 0;
    const isPin = content?.type === 1;
    const isUnPin = content?.type === 2;

    const isNewsletter = output.roomId?.includes('@newsletter');
    const isQuestion = !!message?.message?.questionMessage;
    const isFromMe = message?.key?.fromMe || false;

    if (isFromMe && this.client.options.ignoreMe && type !== 'replied') {
      return;
    }

    const universalId = content?.key?.id;

    if (isRevoke || isPin || isUnPin) {
      if (!universalId) return;
      const universal = await this.client.db('messages').get(universalId);

      if (!universal) return;
      message = universal;

      contentExtract = getDeepContent(message.message);
      contentType = contentExtract.chain.at(-1);
      content = contentExtract.leaf;
    }

    output.roomName = await this.client.getRoomName(output.roomId);

    const s1 = jidNormalizedUser(message?.key?.participant || message?.key?.remoteJid) || '';
    const s2 = jidNormalizedUser(message?.key?.participantAlt || message?.key?.remoteJidAlt) || '';

    output.senderLid = s1.includes('@lid') ? s1 : s2.includes('@lid') ? s2 : null;
    output.senderId = s1.includes('@s.whatsapp.net') ? s1 : s2.includes('@s.whatsapp.net') ? s2 : null;

    output.senderName = normalizeText(message?.pushName || message?.verifiedBizName);

    output.senderDevice = getDevice(output.chatId || '');

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
      output.senderLid = output.receiverLid;
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

    const optPrefix = this.client.options?.prefix;
    const prefixes = Array.isArray(optPrefix) ? optPrefix : [optPrefix];

    output.isPrefix = !!prefixes.find((prefix) => output.text?.startsWith(prefix));

    output.isTagMe = output.mentions?.includes(output.receiverId.split('@')[0]) || output.mentions?.includes(output.receiverLid.split('@')[0]);

    output.isStatusMention = !!message?.message?.statusMentionMessage;
    output.isGroupStatusMention = !!message?.message?.groupStatusMentionMessage;
    output.isHideTags = false;

    if (!output.text?.trim() && content?.contextInfo?.mentionedJid?.length) {
      output.isHideTags = true;
    }

    output.isSpam = await this.limiter.isSpam(output.channelId);

    if (output.isPrefix) {
      output.text = output.text.replace(new RegExp(`^${escapeRegExp(prefixes.find((prefix) => output.text?.startsWith(prefix)) || '')}`), '');
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
          return Boolean(compare.some(val => result.includes(val)));
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

    if (output.isStatusMention) {
      output.chatType = 'statusMention';
    }

    if (output.isGroupStatusMention) {
      output.chatType = 'groupStatusMention';
    }

    output.message = () => original;

    output.replied = null;

    const isReplied = content?.contextInfo?.quotedMessage;
    const isViewOnce = findGlobalWord(toString(isReplied), 'viewOnce');

    const repliedId = content?.contextInfo?.stanzaId;

    if (isReplied && this.maxReplies) {
      this.maxReplies--;

      if (!repliedId) return output; // should logically continue actually, but if it evaluates to true it has stanzaId
      const oldMessage = await this.client.db('messages').get(repliedId);

      let replied;

      if (isViewOnce) {
        replied = {
          ...oldMessage,
          message: isReplied,
        };
      } else {
        replied = oldMessage;
      }

      output.replied = (await this.parse(replied, 'replied')) as never;

      if (output.replied) {
        output.replied.isViewOnce = true;
      }

      this.maxReplies = this.client.options?.maxReplies ?? 3;
    }

    if (type != 'replied') {
      this.client.logs.message(output);
    }

    output.injection = contextStore.getAll();

    return output;
  }
}
