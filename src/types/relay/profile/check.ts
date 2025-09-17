import { z } from "zod/v4";

export const RelayProfileCheckType = z.object({
  senderId: z.string(),
});

