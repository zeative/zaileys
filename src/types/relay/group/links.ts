import { z } from "zod/v4";

export const RelayGroupLinksType = z.object({
  roomId: z.string(),
  action: z.enum(["get", "revoke"]),
});

