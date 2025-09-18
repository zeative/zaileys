import { z } from "zod/v4";

export const RelayGroupCreateType = z.object({
  title: z.string(),
  members: z.string().array(),
});

