import { z } from "zod/v4";

export const RelayGroupActionType = z.object({
  roomId: z.string(),
  action: z.enum(["add", "kick", "promote", "demote"]),
  members: z.string().array(),
});

