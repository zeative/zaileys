import { z } from "zod/v4";

export const RelayProfileBioType = z.object({
  senderId: z.string(),
});

