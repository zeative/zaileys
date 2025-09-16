import z from "zod/v4";
import { ExtractorCallsType } from "../extractor/calls";
import { ExtractorConnectionType } from "../extractor/connection";
import {
  ExtractorMessagesType,
  MessagesVerifiedPlatformType,
} from "../extractor/messages";
import { defaultBoolean, ExtractZod } from "../general";

export const PluginsType = z.array(z.object({
  necessary: z.string(),
  
}).passthrough()).optional();

export const LimiterType = z
  .object({
    durationMs: z.number(),
    maxMessages: z.number(),
  })
  .optional();

export const CitationType = z
  .partialRecord(z.string(), z.number().array())
  .optional();

export const FakeReplyType = z
  .object({
    provider: z.enum(["whatsapp", "meta", "chatgpt", "copilot", "instagram", "tiktok"]),
  })
  .optional();

export const ClientBaseType = z.object({
  session: z.string().default("zaileys-sessions").optional(),
  prefix: z.string().optional(),
  ignoreMe: defaultBoolean(true),
  showLogs: defaultBoolean(true),
  autoMentions: defaultBoolean(true),
  autoOnline: defaultBoolean(true),
  autoRead: defaultBoolean(true),
  autoPresence: defaultBoolean(true),
  autoRejectCall: defaultBoolean(true),
  plugins: PluginsType,
  limiter: LimiterType,
  citation: CitationType,
  fakeReply: FakeReplyType,
});

export const ClientAuthPairingType = z.object({
  authType: z.literal("pairing"),
  phoneNumber: z.number(),
});

export const ClientAuthQRType = z.object({
  authType: z.literal("qr"),
});

export const ClientOptionsType = z.discriminatedUnion("authType", [
  ClientAuthPairingType.extend(ClientBaseType.shape),
  ClientAuthQRType.extend(ClientBaseType.shape),
]);

export const EventEnumType = z.enum([
  "connection",
  "messages",
  "calls",
  "webhooks",
]);

export type EventCallbackType = {
  connection: (ctx: ExtractZod<typeof ExtractorConnectionType>) => void;
  messages: (ctx: ExtractZod<typeof ExtractorMessagesType>) => void;
  calls: (ctx: ExtractZod<typeof ExtractorCallsType>) => void;
  webhooks: (ctx: ExtractZod<typeof EventEnumType>) => void;
};
