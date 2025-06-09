import { z } from "zod";

export const AdapterDatabaseType = z
  .object({
    type: z.enum(["sqlite", "postgresql", "mysql"]).default("sqlite"),
    connection: z
      .object({
        url: z.string().default("./session/zaileys.db"),
      })
      .optional()
      .default({}),
  })
  .optional()
  .default({});

export const CitationType = z
  .record(z.function().returns(z.union([z.number().array(), z.promise(z.number().array())])))
  .optional()
  .transform(async (citation) => {
    if (!citation) return {};
    const transform: Record<string, number[]> = {};
    for (const [key, fn] of Object.entries(citation)) {
      const newKey = `is${key.charAt(0).toUpperCase()}${key.slice(1)}`;
      transform[newKey] = await fn();
    }
    return transform;
  });

const LimiterType = z.object({
  durationMs: z.number(),
  maxMessages: z.number()
}).optional();

const WebhooksType = z.object({
  url: z.string()
}).optional();

export const ClientClassesBaseType = z.object({
  prefix: z.string().optional(),
  ignoreMe: z.boolean().optional().default(true),
  showLogs: z.boolean().optional().default(true),
  autoMentions: z.boolean().optional().default(true),
  autoOnline: z.boolean().optional().default(true),
  autoRead: z.boolean().optional().default(true),
  autoPresence: z.boolean().optional().default(true),
  autoRejectCall: z.boolean().optional().default(true),
  loadLLMSchemas: z.boolean().optional().default(false),
  webhooks: WebhooksType,
  limiter: LimiterType,
  database: AdapterDatabaseType,
  citation: CitationType,
});

const ClientPairingType = z
  .object({
    authType: z.literal("pairing"),
    phoneNumber: z.number(),
  })
  .extend(ClientClassesBaseType.shape);

const ClientQRType = z
  .object({
    authType: z.literal("qr"),
    phoneNumber: z.undefined().optional(),
  })
  .extend(ClientClassesBaseType.shape);

export const ClientClassesType = z.discriminatedUnion("authType", [ClientPairingType, ClientQRType]);
