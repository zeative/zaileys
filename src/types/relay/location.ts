import { z } from "zod/v4";
import { AdsReplyType } from "../general";

export const RelayLocationEnumType = z.enum(["text", "reply", "forward"]);

export const RelayLocationType = z.object({
  latitude: z.number(),
  longitude: z.number(),
  title: z.string().optional(),
  footer: z.string().optional(),
  roomId: z.string().optional(),
  externalAdReply: AdsReplyType.optional(),
});
