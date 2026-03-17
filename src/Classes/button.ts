import makeWASocket, { generateMessageIDV2, generateWAMessageFromContent, isJidGroup, MessageGenerationOptionsFromContent, proto, prepareWAMessageMedia } from 'baileys';
import * as v from 'valibot';
import { centerStore } from '../Store';
import { SignalOptionsType } from '../Types/Signal/signal';
import { ignoreLint } from '../Utils';

export class InteractiveButtons {
  private toNativeSimple(buttons: Array<{ id: string; text: string }>) {
    return buttons.map(({ id, text }) => ({
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({ display_text: text, id }),
    }));
  }

  private toNativeInteractive(buttons: Array<any>) {
    const map = {
      quick_reply: (x) => ({ display_text: x.text, id: x.id }),
      cta_url: (x) => ({ display_text: x.text, url: x.url, merchant_url: x.url }),
      cta_copy: (x) => ({ display_text: x.text, id: x.id, copy_code: x.copy }),
      cta_call: (x) => ({ display_text: x.text, phone_number: x.phoneNumber }),
      single_select: (x) => ({ title: x.text, sections: x.section }),
    };

    return buttons.map((b) => ({
      name: b.type,
      buttonParamsJson: JSON.stringify(map[b.type](b)),
    }));
  }

  private async build(payload: v.InferOutput<typeof SignalOptionsType>, socket: any): Promise<proto.Message.IInteractiveMessage> {
    const buttons = ignoreLint(payload).buttons;
    const data = buttons?.data || [];
    const type = buttons?.type;

    if (type === 'carousel') {
      const cards = [];
      for (const card of data) {
        let media = {};
        if (card.header?.image || card.header?.video) {
          media = await prepareWAMessageMedia(
            card.header.image ? { image: { url: card.header.image } } : { video: { url: card.header.video } },
            { upload: socket.waUploadToServer }
          );
        }

        cards.push({
          body: proto.Message.InteractiveMessage.Body.fromObject({ text: card.body }),
          footer: card.footer ? proto.Message.InteractiveMessage.Footer.fromObject({ text: card.footer }) : undefined,
          header: proto.Message.InteractiveMessage.Header.fromObject({
            title: card.header?.title || '',
            subtitle: card.header?.subtitle || '',
            hasMediaAttachment: !!(card.header?.image || card.header?.video || card.header?.hasMediaAttachment),
            ...media
          }),
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
            buttons: this.toNativeInteractive(card.nativeFlow)
          })
        });
      }

      return {
        body: proto.Message.InteractiveMessage.Body.fromObject({ text: ignoreLint(payload).text }),
        footer: buttons.footer ? proto.Message.InteractiveMessage.Footer.fromObject({ text: buttons.footer }) : undefined,
        carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({ cards })
      };
    }

    const native = type == 'simple' ? this.toNativeSimple(data) : this.toNativeInteractive(data);

    return {
      body: { text: ignoreLint(payload).text },
      footer: buttons.footer ? { text: buttons.footer } : undefined,
      nativeFlowMessage: { buttons: native },
    };
  }

  async send(roomId: string, payload: v.InferInput<typeof SignalOptionsType>, options: Partial<MessageGenerationOptionsFromContent>) {
    const socket = centerStore.get('socket') as ReturnType<typeof makeWASocket> & { config: any, waUploadToServer: any };

    const userJid = socket?.authState?.creds?.me?.id || socket?.user?.id;
    const content = await this.build(payload, socket);

    const isCarousel = ignoreLint(payload).buttons?.type === 'carousel';

    const msg = generateWAMessageFromContent(
      roomId,
      isCarousel
        ? {
            viewOnceMessage: {
              message: {
                messageContextInfo: {
                  deviceListMetadata: {},
                  deviceListMetadataVersion: 2,
                },
                interactiveMessage: content,
              },
            },
          }
        : { interactiveMessage: content },
      {
        userJid,
        messageId: generateMessageIDV2(userJid),
        ...options,
      },
    );

    await socket.relayMessage(roomId, msg.message, {
      messageId: msg.key.id,
      ...options,
      additionalNodes: [
        {
          tag: 'biz',
          attrs: {},
          content: [
            {
              tag: 'interactive',
              attrs: { type: 'native_flow', v: '1' },
              content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
            },
          ],
        },
      ],
    });

    if (socket.config?.emitOwnEvents && !isJidGroup(roomId)) {
      process.nextTick(() => socket.upsertMessage?.(msg, 'append'));
    }

    return msg;
  }
}
