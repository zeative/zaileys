import { WAMessage } from 'baileys';
import z from 'zod';

export const DEVICE_ENUM_TYPES = z.enum(['unknown', 'android', 'ios', 'desktop', 'web']);

export const MESSAGE_ENUM_TYPES = z.enum([
  'text',
  'image',
  'contact',
  'location',
  'document',
  'audio',
  'video',
  'protocol',
  'contacts',
  'highlyStructured',
  'sendPayment',
  'requestPayment',
  'declinePaymentRequest',
  'cancelPaymentRequest',
  'template',
  'sticker',
  'groupInvite',
  'product',
  'deviceSent',
  'list',
  'viewOnce',
  'order',
  'ephemeral',
  'invoice',
  'buttons',
  'paymentInvite',
  'interactive',
  'reaction',
  'sticker',
  'interactiveResponse',
  'pollCreation',
  'pollUpdate',
  'keepInChat',
  'document',
  'requestPhoneNumber',
  'viewOnce',
  'reaction',
  'text',
  'viewOnce',
  'pollCreation',
  'scheduledCallCreation',
  'groupMentioned',
  'pinInChat',
  'pollCreation',
  'scheduledCallEdit',
  'ptv',
  'botInvoke',
  'callLog',
  'encComment',
  'bcall',
  'lottieSticker',
  'event',
  'comment',
  'placeholder',
  'encEventUpdate',
]);

export const ListenerMessagesType = z.object({
  channelId: z.string(),
  uniqueId: z.string(),

  chatId: z.string(),
  chatAddress: z.enum(['pn', 'lid']),
  chatType: MESSAGE_ENUM_TYPES,

  receiverId: z.string(),
  receiverName: z.string(),

  roomId: z.string(),
  roomName: z.string(),

  senderLid: z.string(),
  senderId: z.string(),
  senderName: z.string(),
  senderDevice: DEVICE_ENUM_TYPES,

  timestamp: z.number(),

  text: z.string().nullable(),
  mentions: z.string().array(),
  links: z.string().array(),

  isFromMe: z.boolean(),
  isPrefix: z.boolean(),
  isSpam: z.boolean(),
  isTagMe: z.boolean(),
  isGroup: z.boolean(),
  isNewsletter: z.boolean(),
  isQuestion: z.boolean(),
  isStory: z.boolean(),
  isViewOnce: z.boolean(),
  isEdited: z.boolean(),
  isDeleted: z.boolean(),
  isPinned: z.boolean(),
  isUnPinned: z.boolean(),
  isBroadcast: z.boolean(),
  isEphemeral: z.boolean(),
  isForwarded: z.boolean(),

  citation: z.record(z.string(), z.function({ output: z.promise(z.boolean()) })).nullable(),

  media: z
    .object({
      buffer: z.function(),
      stream: z.function(),
    })
    .loose()
    .nullable(),

  message: z.function({
    input: [],
    output: z.custom<WAMessage>(),
  }),

  get replied() {
    return ListenerMessagesType.nullable();
  },
});
