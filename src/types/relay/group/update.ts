import { z } from "zod/v4";

export const RelayGroupUpdateType = z.object({
  roomId: z.string(),
  text: z.string(),
  action: z.enum(["subject", "description"]),
});
