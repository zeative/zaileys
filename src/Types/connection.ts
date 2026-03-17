import * as v from 'valibot';

export const ListenerConnectionType = v.object({
  status: v.picklist(['connecting', 'open', 'close', 'reload', 'syncing']),

  authType: v.picklist(['pairing', 'qr']),
  authTimeout: v.optional(v.number()),

  syncProgress: v.optional(v.number()),
  syncCompleted: v.optional(v.boolean(), false),

  qr: v.optional(v.string()),
  code: v.optional(v.string()),
});

export type ConnectionContext = v.InferOutput<typeof ListenerConnectionType>;
