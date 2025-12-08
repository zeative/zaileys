import { generateMessageIDV2, generateWAMessageFromContent, isJidGroup, MessageGenerationOptionsFromContent } from 'baileys';
import _ from 'lodash';
import z from 'zod';
import { store } from '../Modules/store';
import { SignalOptionsType } from '../Types/signal';
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
      quick_reply: (b: any) => ({ display_text: b.text, id: b.id }),
      cta_url: (b: any) => ({ display_text: b.text, url: b.url, merchant_url: b.url }),
      cta_copy: (b: any) => ({ display_text: b.text, id: b.id, copy_code: b.copy }),
      cta_call: (b: any) => ({ display_text: b.text, phone_number: b.phoneNumber }),
    };

    return buttons.map((b) => ({
      name: b.type,
      buttonParamsJson: JSON.stringify(map[b.type](b)),
    }));
  }

  private build(payload: z.infer<typeof SignalOptionsType>) {
    const buttons = ignoreLint(payload).buttons;
    const data = buttons?.data || [];

    const type = buttons?.type;
    const native = type == 'simple' ? this.toNativeSimple(data) : this.toNativeInteractive(data);

    return {
      interactiveMessage: {
        body: { text: ignoreLint(payload).text },
        footer: buttons.footer ? { text: buttons.footer } : undefined,
        nativeFlowMessage: { buttons: native },
      },
    };
  }

  async send(roomId: string, payload: z.infer<typeof SignalOptionsType>, options: Partial<MessageGenerationOptionsFromContent>) {
    const socket = store.get('socket');

    const userJid = socket.authState?.creds?.me?.id || socket.user?.id;
    const content = this.build(payload);

    const msg = generateWAMessageFromContent(roomId, content, {
      userJid,
      messageId: generateMessageIDV2(userJid),
      ...options,
    });

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
