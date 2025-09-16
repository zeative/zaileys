import { AnyMessageContent } from "baileys";
import { z } from "zod/v4";
import { AdsReplyType } from "../general";

export const RelayReplyType = z.string().or(
  z.object({
    text: z.string(),
    roomId: z.string().optional(),
    options: z.custom<AnyMessageContent>().optional(),
    externalAdReply: AdsReplyType.optional(),
  })
);
