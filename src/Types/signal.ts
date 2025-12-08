import { proto, WAMessage } from 'baileys';
import z from 'zod';
import { ButtonType } from './button';

const MediaType = z.url().or(z.base64()).or(z.instanceof(Buffer));

const MessageTextType = z.object({ text: z.string() }).strip();
const MessageImageType = z.object({ image: MediaType, caption: z.string().optional() }).strip();

const MessageAudioType = z
  .object({
    audio: MediaType,
    caption: z.string().optional(),
    ptt: z.boolean().optional(),
  })
  .strip();

const MessageVideoType = z
  .object({
    video: MediaType,
    caption: z.string().optional(),
    ptv: z.boolean().optional(),
  })
  .strip();

const MessageStickerType = z.object({ sticker: MediaType, caption: z.string().optional() }).strip();
const MessageDocumentType = z.object({ document: MediaType, caption: z.string().optional(), fileName: z.string().optional() }).strip();

export const SignalBaseType = z.object({
  replied: z.custom<WAMessage>().optional(),
  isForwardedMany: z.boolean().optional(),
  isViewOnce: z.boolean().optional(),

  banner: z.custom<proto.ContextInfo.IExternalAdReplyInfo>().optional(),
  buttons: ButtonType.optional(),
});

export const SignalType = z.enum(['forward', 'button']);

export const SignalOptionsUnionType = z.union([MessageTextType, MessageImageType, MessageAudioType, MessageVideoType, MessageStickerType, MessageDocumentType]);
export const SignalOptionsType = z.string().or(SignalOptionsUnionType.and(SignalBaseType));
