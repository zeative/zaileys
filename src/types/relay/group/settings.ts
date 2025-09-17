import { z } from "zod/v4";

export const RelayGroupSettingsType = z.object({
  roomId: z.string(),
  action: z.enum(["open", "close", "lock", "unlock"]),
});
