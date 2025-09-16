import { z } from "zod/v4";

export const RelayReplyType = z.string().or(z.object({
  text: z.string(),
  roomId: z.string().optional(),
}));
