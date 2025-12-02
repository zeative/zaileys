import z from 'zod';

export const ExtractorConnectionType = z.object({
  status: z.enum(['connecting', 'open', 'close']),
  authType: z.enum(['pairing', 'qr']),

  qr: z.string().optional(),
  code: z.string().optional(),

  timeout: z.number(),
});
