import { proto, WAMessage } from 'baileys';
import z from 'zod';

const MessageTextType = z.object({ text: z.string() });
const MessageImageType = z.object({
  image: z.string(),
});

export const SignalBaseType = z.object({
  replied: z.custom<WAMessage>().optional(),
  isForwardedMany: z.boolean().optional(),
});

export const SignalOptionsUnionType = z.union([MessageTextType, MessageImageType]);

export const SignalType = z.enum(['forward', 'button']);
export const SignalAdsType = z.object({ banner: z.custom<proto.ContextInfo.IExternalAdReplyInfo>().optional() });

export const SignalOptionsType = z.string().or(SignalOptionsUnionType.and(SignalBaseType).and(SignalAdsType));
