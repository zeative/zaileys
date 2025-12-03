import z from 'zod';

export const ListenerConnectionType = z.object({
  status: z.enum(['connecting', 'open', 'close', 'reload']),
  authType: z.enum(['pairing', 'qr']),

  qr: z.string().optional(),
  code: z.string().optional(),

  timeout: z.number(),
});
