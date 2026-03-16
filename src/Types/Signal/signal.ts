import { proto, WAMessage } from 'baileys';
import * as v from 'valibot';
import { ButtonType } from '../button';
import { StickerShapeType } from '../client';

const MediaType = v.union([
  v.pipe(v.string(), v.url()), 
  v.pipe(v.string(), v.base64()), 
  v.custom<Buffer>((val) => val instanceof Buffer)
]);

const MessageTextType = v.looseObject({ text: v.string() });
const MessageImageType = v.looseObject({ image: MediaType, caption: v.optional(v.string()) });

const MessageAudioType = v.looseObject({
  audio: MediaType,
  caption: v.optional(v.string()),
  ptt: v.optional(v.boolean()),
});

const MessageVideoType = v.looseObject({
  video: MediaType,
  caption: v.optional(v.string()),
  ptv: v.optional(v.boolean()),
});

const MessageStickerType = v.looseObject({
  sticker: MediaType,
  shape: v.optional(StickerShapeType),
  caption: v.optional(v.string()),
});

const MessageDocumentType = v.looseObject({ document: MediaType, caption: v.optional(v.string()), fileName: v.optional(v.string()) });

export const MessageLocationType = v.looseObject({
  location: v.optional(v.object({
    latitude: v.number(),
    longitude: v.number(),
    url: v.optional(v.pipe(v.string(), v.url())),
    title: v.optional(v.string()),
    footer: v.optional(v.string()),
  })),
});

export const MessageContactType = v.looseObject({
  contacts: v.object({
    title: v.optional(v.string()),
    contacts: v.array(v.object({
        fullname: v.string(),
        phoneNumber: v.number(),
        organization: v.optional(v.string()),
    })),
  }),
});

export const MessagePollCreateType = v.object({
  poll: v.object({
    name: v.string(),
    answers: v.array(v.string()),
    isMultiple: v.optional(v.boolean(), false),
  }),
});

export const SignalBaseType = v.object({
  replied: v.optional(v.custom<WAMessage>((val) => typeof val === 'object' && val !== null)),
  isForwardedMany: v.optional(v.boolean()),
  isViewOnce: v.optional(v.boolean()),

  banner: v.optional(v.custom<proto.ContextInfo.IExternalAdReplyInfo>((val) => typeof val === 'object' && val !== null)),
  buttons: v.optional(ButtonType),
});

export const SignalType = v.picklist(['forward', 'button', 'edit', 'delete']);

export const SignalOptionsUnionType = v.union([
  MessageTextType,
  MessageImageType,
  MessageAudioType,
  MessageVideoType,
  MessageStickerType,
  MessageDocumentType,
  MessageLocationType,
  MessageContactType,
  MessagePollCreateType,
]);

export const SignalOptionsType = v.union([
  v.string(), 
  v.intersect([SignalOptionsUnionType, v.omit(SignalBaseType, ['buttons'])])
]);
export const ButtonOptionsType = v.intersect([MessageTextType, v.omit(SignalBaseType, ['banner'])]);
