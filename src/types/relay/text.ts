import { z } from "zod/v4";

export const RelayTextType = z.string().or(z.object({
  text: z.string(),
  roomId: z.string().optional()
}));
