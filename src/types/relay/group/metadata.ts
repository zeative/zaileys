import { z } from "zod/v4";

export const RelayGroupMetadataType = z.object({
  roomId: z.string(),
});
