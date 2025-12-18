import { z } from 'zod';
import { CallsContext } from './calls';
import { ConnectionContext } from './connection';
import { MessagesContext } from './messages';

export const LimiterType = z
  .object({
    maxMessages: z.number().default(20),
    durationMs: z.number().default(10_000),
  })
  .optional();

export const CitationType = z.record(z.string(), z.function({ output: z.promise(z.array(z.number())) })).optional();

export const FakeReplyType = z
  .object({
    provider: z.enum(['whatsapp', 'meta', 'chatgpt', 'copilot', 'instagram', 'tiktok']).or(z.number()),
  })
  .optional();

export const StickerShapeType = z.enum(['default', 'rounded', 'circle', 'oval']).default('default');

export const StickerMetadataType = z
  .object({
    packageName: z.string(),
    authorName: z.string(),
    quality: z.number(),
    shape: StickerShapeType.optional(),
  })
  .optional();

export const ClientBaseType = z.object({
  session: z.string().default('zaileys').optional(),
  prefix: z.string().optional(),

  ignoreMe: z.boolean().default(true).optional(),
  showLogs: z.boolean().default(true).optional(),

  syncFullHistory: z.boolean().default(true).optional(),
  disableFFmpeg: z.boolean().default(false).optional(),

  autoMarkAI: z.boolean().default(true).optional(),
  autoMentions: z.boolean().default(true).optional(),
  autoOnline: z.boolean().default(true).optional(),
  autoRead: z.boolean().default(true).optional(),
  autoPresence: z.boolean().default(true).optional(),
  autoRejectCall: z.boolean().default(true).optional(),

  limiter: LimiterType,
  citation: CitationType,
  fakeReply: FakeReplyType,
  sticker: StickerMetadataType,
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
  connection: (ctx: ConnectionContext) => void;
  messages: (ctx: MessagesContext) => void;
  calls: (ctx: CallsContext) => void;
};
