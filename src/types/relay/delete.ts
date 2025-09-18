import { z } from "zod/v4";

export const RelayDeleteType = z.object({
  message: z.function({
    input: [],
    output: z.any(),
  }).optional(),
});
