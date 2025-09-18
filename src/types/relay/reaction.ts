import { z } from "zod/v4";

export const RelayReactionType = z.emoji().or(
  z.object({
    emoticon: z.emoji(),
    message: z
      .function({
        input: [],
        output: z.any(),
      })
      .optional(),
  })
);
