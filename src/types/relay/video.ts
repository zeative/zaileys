import { z } from "zod/v4";
import { defaultBoolean } from "../general";

export const RelayVideoEnumType = z.enum(["text", "reply", "forward"])

export const RelayVideoType = z.object({
  video: z.url().or(z.base64()).or(z.instanceof(Buffer)),
  text: z.string().optional(),
  viewOnce: defaultBoolean(false),
  roomId: z.string().optional()
})
