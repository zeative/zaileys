import { z } from "zod/v4";

export const RelayEditType = z.object({
  text: z.string(),
  message: z.function({
    input: [],
    output: z.any(),
  }).optional(),
});
