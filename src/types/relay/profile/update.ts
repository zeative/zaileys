import { z } from "zod/v4";

export const RelayProfileUpdateType = z.object({
  type: z.enum(["name", "bio", "avatar"]),
  text: z.string().optional(),
  roomId: z.string().optional(),
  avatar: z.url().or(z.base64()).or(z.instanceof(Buffer)).or(z.literal("remove")),
});
