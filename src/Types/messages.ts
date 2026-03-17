import { WAMessage } from 'baileys';
import Stream from 'stream';
import * as v from 'valibot';

export const DEVICE_ENUM_TYPES = v.picklist(['unknown', 'android', 'ios', 'desktop', 'web']);

export const MESSAGE_ENUM_TYPES = v.picklist([
  'text',
  'album',
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
  'groupStatusMention',
  'statusMention',
  'declinePaymentRequest',
  'cancelPaymentRequest',
  'template',
  'sticker',
  'groupInvite',
  'product',
  'deviceSent',
  'lists',
  'viewOnce',
  'order',
  'ephemeral',
  'invoice',
  'buttons',
  'paymentInvite',
  'interactive',
  'reaction',
  'interactiveResponse',
  'pollCreation',
  'pollUpdate',
  'keepInChat',
  'requestPhoneNumber',
  'scheduledCallCreation',
  'groupMentioned',
  'pinInChat',
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

export const BaseMessagesType = v.object({
  channelId: v.string(),
  uniqueId: v.string(),

  chatId: v.string(),
  chatType: MESSAGE_ENUM_TYPES,

  receiverLid: v.string(),
  receiverId: v.string(),
  receiverName: v.string(),

  roomId: v.string(),
  roomLid: v.nullable(v.string()),
  roomName: v.nullable(v.string()),

  senderLid: v.string(),
  senderId: v.string(),
  senderName: v.string(),
  senderDevice: DEVICE_ENUM_TYPES,

  timestamp: v.number(),

  text: v.nullable(v.string()),
  mentions: v.array(v.string()),
  links: v.array(v.string()),

  isBot: v.boolean(),
  isFromMe: v.boolean(),
  isPrefix: v.boolean(),
  isSpam: v.boolean(),
  isTagMe: v.boolean(),

  isStatusMention: v.boolean(),
  isGroupStatusMention: v.boolean(),
  isHideTags: v.boolean(),

  isGroup: v.boolean(),
  isNewsletter: v.boolean(),
  isQuestion: v.boolean(),
  isStory: v.boolean(),

  isViewOnce: v.boolean(),
  isEdited: v.boolean(),
  isDeleted: v.boolean(),
  isPinned: v.boolean(),
  isUnPinned: v.boolean(),

  isBroadcast: v.boolean(),
  isEphemeral: v.boolean(),
  isForwarded: v.boolean(),

  citation: v.nullable(v.record(v.string(), v.custom<(...args: unknown[]) => Promise<boolean>>((val) => typeof val === 'function'))),

  media: v.nullable(v.looseObject({
    buffer: v.custom<() => Promise<Buffer>>((val) => typeof val === 'function'),
    stream: v.custom<() => Promise<Stream>>((val) => typeof val === 'function'),
  })),

  injection: v.optional(v.record(v.string(), v.any()), {}),

  message: v.custom<() => WAMessage>((val) => typeof val === 'function'),
});

export const ListenerMessagesType = v.object({
  ...BaseMessagesType.entries,
  replied: v.nullable(BaseMessagesType),
});

export type MessagesContext = v.InferOutput<typeof ListenerMessagesType>;
