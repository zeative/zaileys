import { z } from "zod/v4";

export const RelayGroupLeaveType = z.object({
  roomId: z.string(),
});
