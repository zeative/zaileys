import { z } from "zod/v4";
import { AdsReplyType, defaultBoolean } from "../general";

export const RelayImageEnumType = z.enum(["text", "reply", "forward"]);

export const RelayImageType = z.object({
  image: z.url().or(z.base64()).or(z.instanceof(Buffer)),
  text: z.string().optional(),
  viewOnce: defaultBoolean(false),
  roomId: z.string().optional(),
  externalAdReply: AdsReplyType.optional(),
});
