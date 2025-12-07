import { WAMessage } from 'baileys';
import z from 'zod';

const MessageTextType = z.string().or(z.object({ text: z.string() }));
const MessageImageType = z.object({
  image: z.string(),
});

export const SignalBaseType = z.object({
  replied: z.custom<WAMessage>().optional(),
  isForwardedMany: z.boolean().optional(),
});

export const SignalOptionsUnionType = z.union([MessageTextType, MessageImageType]);

export const SignalOptionsType = SignalOptionsUnionType.and(SignalBaseType);
export const SignalType = z.enum(['forward', 'button']);
