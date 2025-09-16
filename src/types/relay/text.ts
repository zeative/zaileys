import { z } from "zod/v4";
import { AnyMessageContent } from "baileys";

export const RelayTextType = z.string().or(z.object({
  text: z.string(),
  roomId: z.string().optional(),
  options: z.custom<AnyMessageContent>().optional()
}));
