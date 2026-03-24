import makeWASocket, { AnyMessageContent, MiscMessageGenerationOptions, WAMessage } from 'baileys';

import * as v from 'valibot';
import { MESSAGES_VERIFIED_TYPE } from '../Config/media';
import { centerStore } from '../Store';
import { Media } from '@zaileys/media-process';
import { parseValibot } from '../Library/valibot';
import { ButtonOptionsType, SignalOptionsType, SignalType } from '../Types/Signal/signal';
import { extractJids, ignoreLint, pickKeysFromArray } from '../Utils';
import { InteractiveButtons } from '../Classes/button';
import { Client } from '../Classes/client';

export class Signal {
  constructor(protected client: Client) { }

  protected async signal(roomId: string, options: v.InferInput<typeof SignalOptionsType> | any, type?: v.InferInput<typeof SignalType>, message?: WAMessage) {
    if (type != 'delete') {
      if (type == 'button') {
        options = parseValibot(ButtonOptionsType, options);
      } else {
        options = parseValibot(SignalOptionsType, options);
      }
    }

    let socket = centerStore.get('socket') as ReturnType<typeof makeWASocket>;
    if (!socket) {
      throw new Error('[Zaileys] Socket is not initialized or has been lost from centerStore. Please ensure Client is properly initialized.');
    }


    let output: Partial<AnyMessageContent> = {};
    let misc: Partial<MiscMessageGenerationOptions> = {};

    const isText = typeof options === 'string';
    const hasKey = (obj: any, key: string) => typeof obj === 'object' && obj !== null && key in obj;

    const isFakeReply = this.client.options?.fakeReply?.provider;
    const isAutoMentions = this.client.options?.autoMentions;
    const isAutoPresence = this.client.options?.autoPresence;

    const isReplied = hasKey(options, 'replied');
    const isBanner = hasKey(options, 'banner');
    const isViewOnce = hasKey(options, 'isViewOnce');
    const isButton = type == 'button';

    const hasImage = hasKey(options, 'image');
    const hasVideo = hasKey(options, 'video');
    const hasAudio = hasKey(options, 'audio');
    const hasSticker = hasKey(options, 'sticker');
    const hasDocument = hasKey(options, 'document');

    const hasLocation = hasKey(options, 'location');
    const hasContacts = hasKey(options, 'contacts');
    const hasPoll = hasKey(options, 'poll');

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

      output.contextInfo.externalAdReply.mediaType = 1;
    }

    if (isViewOnce) {
      output = {
        ...output,
        viewOnce: ignoreLint(options)?.isViewOnce,
      };
    }

    if (text) {
      output = { ...output, text, caption: text };

      if (isMedia) {
        delete ignoreLint(output).text;
      }
    }

    if (isMedia) {
      if (hasImage) {
        const imageInput = ignoreLint(options).image;
        output = {
          ...output,
          image: await new Media(imageInput).image.toJpeg(),
          jpegThumbnail: await new Media(imageInput).thumbnail.get(),
        };
      }

      if (hasVideo) {
        const isPtv = ignoreLint(options)?.ptv;
        const videoInput = ignoreLint(options).video;

        output = {
          ...output,
          video: await new Media(videoInput).video.toMp4(),
          ptv: isPtv,
          jpegThumbnail: await new Media(videoInput).thumbnail.get(),
        };
      }

      if (hasAudio) {
        const isPtt = ignoreLint(options)?.ptt;
        const audioInput = ignoreLint(options).audio;

        output = {
          ...output,
          audio: await new Media(audioInput).audio.toOpus(),
          ptt: isPtt,
          mimetype: isPtt ? 'audio/ogg; codecs=opus' : 'audio/mpeg',
        };
      }

      if (hasSticker) {
        const shape = ignoreLint(options)?.shape;
        const stickerInput = ignoreLint(options).sticker;
        const safeShape = shape === 'rounded' ? 'default' : shape;
        const stickerMetadata = { ...this.client.options?.sticker, shape: safeShape };

        output = {
          ...output,
          sticker: await new Media(stickerInput).sticker.create(stickerMetadata),
        };
      }

      if (hasDocument) {
        const documentInput = ignoreLint(options).document;
        const data = await new Media(documentInput).document.create();
        const rawName = ignoreLint(options).fileName || `Document_${data.fileName.slice(-6)}`;
        const nameWithoutExt = rawName.includes('.') ? rawName.substring(0, rawName.lastIndexOf('.')) : rawName;

        output = {
          ...output,
          ...data,
          fileName: `${nameWithoutExt}.${data.ext} - Zaileys`,
        };
      }
    }

    if (hasLocation) {
      const params = ignoreLint(options).location;

      output = {
        ...output,
        location: {
          degreesLatitude: params.latitude,
          degreesLongitude: params.longitude,
          url: params.url,
          address: params.footer,
          name: params.title,
        },
      };
    }

    if (hasContacts) {
      const params = ignoreLint(options)?.contacts;

      const contacts = params?.contacts.map((x) => {
        const vcard = [
          'BEGIN:VCARD',
          'VERSION:3.0',
          `FN:${x.fullname}`,
          `ORG:${x.organization || ''}`,
          `TEL;type=CELL;type=VOICE;waid=${x.phoneNumber}:${x.phoneNumber}`,
          'END:VCARD',
        ].join('\n');

        return { displayName: x.fullname, vcard };
      });

      output = {
        ...output,
        contacts: {
          displayName: params?.title,
          contacts,
        },
      };
    }

    if (hasPoll) {
      const params = ignoreLint(options)?.poll;

      output = {
        ...output,
        poll: {
          name: params.name,
          values: params.answers,
          selectableCount: !!params.isMultiple ? 1 : 0,
          toAnnouncementGroup: true,
        },
      };
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

    if (type == 'edit') {
      output = {
        ...output,
        edit: message?.key,
      };

      await socket.sendPresenceUpdate('paused', roomId);
    }

    if (type == 'delete') {
      output = {
        ...output,
        delete: message?.key,
      };

      await socket.sendPresenceUpdate('paused', roomId);
    }

    if (isButton) {
      const button = new InteractiveButtons();
      return await button.send(roomId, options, misc);
    } else {
      return await socket.sendMessage(roomId, ignoreLint(output), misc);
    }
  }

  async send(roomId: string, options: v.InferInput<typeof SignalOptionsType>) {
    return await this.signal(roomId, options);
  }

  async forward(roomId: string, options: v.InferInput<typeof SignalOptionsType>) {
    return await this.signal(roomId, options, 'forward');
  }

  async button(roomId: string, options: v.InferInput<typeof ButtonOptionsType>) {
    return await this.signal(roomId, options, 'button');
  }

  async edit(message: WAMessage, options: v.InferInput<typeof SignalOptionsType>) {
    return await this.signal(message.key.remoteJid as string, options, 'edit', message);
  }

  async delete(message: WAMessage | WAMessage[]) {
    if (Array.isArray(message)) {
      return Promise.all(
        message.map((message) => {
          return this.signal(message.key.remoteJid, {}, 'delete', message);
        }),
      );
    }

    return await this.signal(message.key.remoteJid, {}, 'delete', message);
  }

  async presence(roomId: string, type: 'typing' | 'recording' | 'online' | 'offline' | 'paused') {
    const socket = centerStore.get('socket') as ReturnType<typeof makeWASocket>;
    if (!socket) {
      throw new Error('[Zaileys] Socket is not initialized or has been lost from centerStore. Please ensure Client is properly initialized.');
    }


    const options = {
      typing: 'composing',
      recording: 'recording',
      online: 'available',
      offline: 'unavailable',
      paused: 'paused',
    } as const;

    return await socket.sendPresenceUpdate(options[type], roomId);
  }

  async reaction(message: WAMessage, reaction: string) {
    const socket = centerStore.get('socket') as ReturnType<typeof makeWASocket>;
    if (!socket) {
      throw new Error('[Zaileys] Socket is not initialized or has been lost from centerStore. Please ensure Client is properly initialized.');
    }
    return await socket.sendMessage(message.key.remoteJid, { react: { text: reaction, key: message?.key } });
  }

  async memberLabel(roomId: string, label: string) {
    const socket = centerStore.get('socket') as ReturnType<typeof makeWASocket>;
    if (!socket) {
      throw new Error('[Zaileys] Socket is not initialized or has been lost from centerStore. Please ensure Client is properly initialized.');
    }


    return await socket.relayMessage(
      roomId,
      {
        protocolMessage: {
          type: 30,
          memberLabel: {
            label,
            labelTimestamp: Date.now(),
          },
        },
      },
      {},
    );
  }
}
