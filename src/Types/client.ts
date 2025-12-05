import { z } from 'zod';
import { ListenerCallsType } from './calls';
import { ListenerConnectionType } from './connection';
import { ListenerMessagesType } from './messages';

export const LimiterType = z
  .object({
    durationMs: z.number().default(10_000),
    maxMessages: z.number().default(20),
  })
  .optional();

export const ClientBaseType = z.object({
  session: z.string().default('zaileys').optional(),
  prefix: z.string().optional(),

  ignoreMe: z.boolean().default(true).optional(),
  showLogs: z.boolean().default(true).optional(),

  syncFullHistory: z.boolean().default(true).optional(),

  autoMentions: z.boolean().default(true).optional(),
  autoOnline: z.boolean().default(true).optional(),
  autoRead: z.boolean().default(true).optional(),
  autoPresence: z.boolean().default(true).optional(),
  autoRejectCall: z.boolean().default(true).optional(),

  limiter: LimiterType,
});

export const ClientAuthPairingType = z.object({
  authType: z.literal('pairing'),
  phoneNumber: z.number(),
});

export const ClientAuthQRType = z.object({
  authType: z.literal('qr'),
});

export const ClientOptionsType = z.union([ClientAuthPairingType.extend(ClientBaseType.shape), ClientAuthQRType.extend(ClientBaseType.shape)]);

export const EventEnumType = z.enum(['connection', 'messages', 'calls']);

export type EventCallbackType = {
  connection: (ctx: z.infer<typeof ListenerConnectionType>) => void;
  messages: (ctx: z.infer<typeof ListenerMessagesType>) => void;
  calls: (ctx: z.infer<typeof ListenerCallsType>) => void;
};
