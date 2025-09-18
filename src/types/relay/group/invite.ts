import { z } from "zod/v4";

export const RelayGroupInviteType = z.object({
  url: z.url().regex(/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]{5,}$/),
  action: z.enum(["join", "info"]),
});

