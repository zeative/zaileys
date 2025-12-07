import makeWASocket, { AnyMessageContent, MiscMessageGenerationOptions } from 'baileys';
import _ from 'lodash';
import z from 'zod';
import { MESSAGES_VERIFIED_TYPE } from '../Config/media';
import { store } from '../Modules/store';
import { parseZod } from '../Modules/zod';
import { SignalOptionsType, SignalType } from '../Types/signal';
import { convertToOpus, extractJids, getMediaThumbnail, getWaSticker, ignoreLint, pickKeysFromArray } from '../Utils';
import { Client } from './client';

export class Signal {
  constructor(protected client: Client) {}

  protected async initialize(roomId: string, options: z.infer<typeof SignalOptionsType>, type?: z.infer<typeof SignalType>) {
    options = parseZod(SignalOptionsType, options);

    let socket = store.get('socket') as ReturnType<typeof makeWASocket>;

    let output: Partial<AnyMessageContent> = {};
    let misc: Partial<MiscMessageGenerationOptions> = {};

    const isText = _.isString(options);

    const isFakeReply = this.client.options?.fakeReply?.provider;
    const isAutoMentions = this.client.options?.autoMentions;
    const isAutoPresence = this.client.options?.autoPresence;

    const isReplied = _.has(options, 'replied');
    const isBanner = _.has(options, 'banner');
    const isViewOnce = _.has(options, 'isViewOnce');

    const hasText = _.has(options, 'text');
    const hasImage = _.has(options, 'image');
    const hasVideo = _.has(options, 'video');
    const hasAudio = _.has(options, 'audio');
    const hasSticker = _.has(options, 'sticker');
    const hasDocument = _.has(options, 'document');

    const isMedia = hasImage || hasVideo || hasAudio || hasSticker || hasDocument;

    const text = isText ? options : pickKeysFromArray([options], ['text', 'caption']);

    if (isAutoPresence) {
      if (hasAudio) {
        await socket.sendPresenceUpdate('recording', roomId);
      } else {
        await socket.sendPresenceUpdate('composing', roomId);
      }
    }

    if (isAutoMentions) {
      output = {
        ...output,
        mentions: extractJids(text),
        contextInfo: {
          mentionedJid: extractJids(text),
        },
      };
    }

    if (isReplied) {
      misc.quoted = ignoreLint(options).replied;

      if (isFakeReply) {
        misc.quoted.key.remoteJid = MESSAGES_VERIFIED_TYPE[isFakeReply];
        misc.quoted.key.participant = MESSAGES_VERIFIED_TYPE[isFakeReply];
      }
    }

    if (isBanner) {
      output = {
        ...output,
        contextInfo: {
          externalAdReply: ignoreLint(options).banner,
        },
      };
    }

    if (isViewOnce) {
      output = {
        ...output,
        viewOnce: ignoreLint(options)?.isViewOnce,
      };
    }

    if (isText || hasText) {
      output = { ...output, text, caption: text };

      if (isMedia) {
        delete ignoreLint(output).text;
      }
    }

    if (isMedia) {
      const media = pickKeysFromArray([options], ['image', 'video', 'audio', 'sticker', 'document']);
      const isUrl = _.isString(media);

      const content = isUrl ? { url: media } : media;

      if (hasImage) {
        output = {
          ...output,
          image: content,
          jpegThumbnail: await getMediaThumbnail(media),
        };
      }

      if (hasVideo) {
        output = {
          ...output,
          video: content,
          jpegThumbnail: await getMediaThumbnail(media),
        };
      }

      if (hasAudio) {
        output = {
          ...output,
          audio: await convertToOpus(media),
        };
      }

      if (hasSticker) {
        output = {
          ...output,
          sticker: await getWaSticker(media, this.client.options?.sticker),
        };
      }
    }

    if (type == 'forward') {
      output = {
        ...output,
        contextInfo: {
          ...ignoreLint(output).contextInfo,
          isForwarded: true,
          forwardingScore: ignoreLint(options).isForwardedMany ? 9999 : 1,
        },
      };
    }

    await socket.sendMessage(roomId, ignoreLint(output), misc);
  }

  async send(roomId: string, options: z.infer<typeof SignalOptionsType>) {
    await this.initialize(roomId, options);
  }

  async forward(roomId: string, options: z.infer<typeof SignalOptionsType>) {
    await this.initialize(roomId, options, 'forward');
  }

  async button(roomId: string, options: z.infer<typeof SignalOptionsType>) {
    await this.initialize(roomId, options, 'button');
  }
}
