import { z } from "zod/v4";

export const ExtractorConnectionType = z.object({
  status: z.enum(["connecting", "open", "close"]),
});
