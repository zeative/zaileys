import { z } from "zod/v4";
import { defaultBoolean } from "../general";
import { AnyMessageContent } from "baileys";

export const RelayForwardType = z.string().or(
  z.object({
    text: z.string(),
    isForwardMany: defaultBoolean(false),
    roomId: z.string().optional(),
    options: z.custom<AnyMessageContent>().optional(),
  })
);
