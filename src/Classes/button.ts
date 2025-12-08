import { generateMessageIDV2, generateWAMessageFromContent, isJidGroup, MessageGenerationOptionsFromContent, proto } from 'baileys';
import z from 'zod';
import { store } from '../Modules/store';
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

  private build(payload: z.infer<typeof SignalOptionsType>): proto.Message.IInteractiveMessage {
    const buttons = ignoreLint(payload).buttons;
    const data = buttons?.data || [];

    const type = buttons?.type;
    const native = type == 'simple' ? this.toNativeSimple(data) : this.toNativeInteractive(data);

    return {
      body: { text: ignoreLint(payload).text },
      footer: buttons.footer ? { text: buttons.footer } : undefined,
      nativeFlowMessage: { buttons: native },
    };
  }

  async send(roomId: string, payload: z.infer<typeof SignalOptionsType>, options: Partial<MessageGenerationOptionsFromContent>) {
    const socket = store.get('socket');

    const userJid = socket.authState?.creds?.me?.id || socket.user?.id;
    const content = this.build(payload);

    const msg = generateWAMessageFromContent(
      roomId,
      { interactiveMessage: content },
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
