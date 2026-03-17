import * as v from 'valibot';
import { CallsContext } from './calls';
import { ConnectionContext } from './connection';
import { MessagesContext } from './messages';

export const LimiterType = v.optional(v.object({
  maxMessages: v.optional(v.number(), 20),
  durationMs: v.optional(v.number(), 10_000),
}));

export const CitationType = v.optional(v.record(v.string(), v.custom<(...args: unknown[]) => Promise<number[]>>((val) => typeof val === 'function')));

export const FakeReplyType = v.optional(v.object({
  provider: v.union([v.picklist(['whatsapp', 'meta', 'chatgpt', 'copilot', 'instagram', 'tiktok']), v.number()]),
}));

export const StickerShapeType = v.optional(v.picklist(['default', 'rounded', 'circle', 'oval']), 'default');

export const ClientStickerOptionsType = v.optional(v.object({
  packageName: v.optional(v.string()),
  authorName: v.optional(v.string()),
  quality: v.optional(v.number()),
  shape: v.optional(StickerShapeType),
}));

export const autoCleanUp = v.optional(v.object({
  enabled: v.optional(v.boolean(), false),
  intervalMs: v.optional(v.number(), 60 * 60 * 1000),
  maxAgeMs: v.optional(v.number(), 24 * 60 * 60 * 1000),
  scopes: v.optional(v.array(v.string()), ['messages']),
}));

export const ClientBaseType = v.object({
  session: v.optional(v.string(), 'zaileys'),
  prefix: v.optional(v.union([v.string(), v.array(v.string())])),

  ignoreMe: v.optional(v.boolean(), true),
  showLogs: v.optional(v.boolean(), true),
  fancyLogs: v.optional(v.boolean(), false),

  syncFullHistory: v.optional(v.boolean(), true),
  disableFFmpeg: v.optional(v.boolean(), false),

  autoMarkAI: v.optional(v.boolean(), true),
  autoMentions: v.optional(v.boolean(), true),
  autoOnline: v.optional(v.boolean(), true),
  autoRead: v.optional(v.boolean(), true),
  autoPresence: v.optional(v.boolean(), true),
  autoRejectCall: v.optional(v.boolean(), true),
  
  deleteSessionOnLogout: v.optional(v.boolean(), false),

  pluginsDir: v.optional(v.string(), 'plugins'),
  pluginsHmr: v.optional(v.boolean(), true),

  autoCleanUp,

  limiter: LimiterType,
  citation: CitationType,
  fakeReply: FakeReplyType,
  sticker: ClientStickerOptionsType,
});

export const ClientAuthPairingType = v.object({
  authType: v.literal('pairing'),
  phoneNumber: v.number(),
});

export const ClientAuthQRType = v.object({
  authType: v.literal('qr'),
});

export const ClientOptionsType = v.union([
  v.object({ ...ClientAuthPairingType.entries, ...ClientBaseType.entries }),
  v.object({ ...ClientAuthQRType.entries, ...ClientBaseType.entries })
]);

export const EventEnumType = v.picklist(['connection', 'messages', 'calls']);

export type EventCallbackType = {
  connection: (ctx: ConnectionContext) => void;
  messages: (ctx: MessagesContext) => void;
  calls: (ctx: CallsContext) => void;
};
