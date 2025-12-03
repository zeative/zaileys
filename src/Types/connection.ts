import z from 'zod';

export const ListenerConnectionType = z.object({
  status: z.enum(['connecting', 'open', 'close', 'reload', 'syncing']),

  authType: z.enum(['pairing', 'qr']),
  authTimeout: z.number().optional(),

  syncProgress: z.number().optional(),
  syncCompleted: z.boolean().default(false).optional(),

  qr: z.string().optional(),
  code: z.string().optional(),
});
