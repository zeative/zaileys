import { z } from "zod/v4";
import { AdsReplyType } from "../general";

export const RelayContactEnumType = z.enum(["text", "reply", "forward"]);

export const RelayContactType = z.object({
  title: z.string().optional(),
  contacts: z
    .object({
      fullname: z.string(),
      nickname: z.string().optional(),
      organization: z.string().optional(),
      whatsAppNumber: z.number(),
      website: z.url().optional(),
    })
    .array(),
  roomId: z.string().optional(),
});
