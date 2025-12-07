import { proto, WAMessage } from 'baileys';
import z from 'zod';

const MediaType = z.url().or(z.base64()).or(z.instanceof(Buffer));

const MessageTextType = z.object({ text: z.string() }).loose();
const MessageImageType = z.object({ image: MediaType }).loose();
const MessageVideoType = z.object({ video: MediaType }).loose();
const MessageStickerType = z.object({ sticker: MediaType }).loose();
const MessageDocumentType = z.object({ document: MediaType }).loose();

export const SignalBaseType = z.object({
  replied: z.custom<WAMessage>().optional(),
  isForwardedMany: z.boolean().optional(),
  isViewOnce: z.boolean().optional(),
});

export const SignalType = z.enum(['forward', 'button']);
export const SignalAdsType = z.object({ banner: z.custom<proto.ContextInfo.IExternalAdReplyInfo>().optional() });

export const SignalOptionsUnionType = z.union([MessageTextType, MessageImageType, MessageVideoType, MessageStickerType, MessageDocumentType]);
export const SignalOptionsType = z.string().or(SignalOptionsUnionType.and(SignalBaseType).and(SignalAdsType));
