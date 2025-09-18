import { z } from "zod/v4";

export const RelayPinType = z.object({
  action: z.enum(["pin", "unpin"]),
  expired: z.enum(["24h", "7d", "30d"]),
  message: z
    .function({
      input: [],
      output: z.any(),
    })
    .optional(),
});
