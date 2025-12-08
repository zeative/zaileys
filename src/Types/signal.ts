import { proto, WAMessage } from 'baileys';
import z from 'zod';
import { ButtonType } from './button';

const MediaType = z.url().or(z.base64()).or(z.instanceof(Buffer));

const MessageTextType = z.object({ text: z.string() }).passthrough();
const MessageImageType = z.object({ image: MediaType, caption: z.string().optional() }).passthrough();

const MessageAudioType = z
  .object({
    audio: MediaType,
    caption: z.string().optional(),
    ptt: z.boolean().optional(),
  })
  .passthrough();

const MessageVideoType = z
  .object({
    video: MediaType,
    caption: z.string().optional(),
    ptv: z.boolean().optional(),
  })
  .passthrough();

const MessageStickerType = z.object({ sticker: MediaType, caption: z.string().optional() }).passthrough();
const MessageDocumentType = z.object({ document: MediaType, caption: z.string().optional(), fileName: z.string().optional() }).passthrough();

export const SignalBaseType = z.object({
  replied: z.custom<WAMessage>().optional(),
  isForwardedMany: z.boolean().optional(),
  isViewOnce: z.boolean().optional(),

  banner: z.custom<proto.ContextInfo.IExternalAdReplyInfo>().optional(),
  buttons: ButtonType.optional(),
});

export const SignalType = z.enum(['forward', 'button', 'edit', 'delete']);

export const SignalOptionsUnionType = z.union([MessageTextType, MessageImageType, MessageAudioType, MessageVideoType, MessageStickerType, MessageDocumentType]);

export const SignalOptionsType = z.string().or(z.intersection(SignalOptionsUnionType, SignalBaseType.omit({ buttons: true })));
export const ButtonOptionsType = z.intersection(MessageTextType, SignalBaseType.omit({ banner: true }));
