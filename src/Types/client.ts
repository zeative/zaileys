// now with zod

import { z } from "zod";

export const ClientOptionsSchema = z.object({
  authType: z.enum(["qr", "pairing"]),
  qrData: z.string().optional(),
  pairingCode: z.string().optional(),
  deviceName: z.string().optional(),
});

export type ClientOptions = z.infer<typeof ClientOptionsSchema>;
