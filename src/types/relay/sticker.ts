import { z } from "zod/v4";

export const RelayStickerEnumType = z.enum(["text", "reply", "forward"])

export const RelayStickerType = z.object({
  sticker: z.url().or(z.base64()).or(z.instanceof(Buffer)),
  roomId: z.string().optional()
})
