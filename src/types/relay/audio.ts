import { z } from "zod/v4";
import { AdsReplyType, defaultBoolean } from "../general";

export const RelayAudioEnumType = z.enum(["text", "reply", "forward"])

export const RelayAudioType = z.object({
  audio: z.url().or(z.base64()).or(z.instanceof(Buffer)),
  viewOnce: defaultBoolean(false),
  roomId: z.string().optional(),
  externalAdReply: AdsReplyType.optional(),
})
