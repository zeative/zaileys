import { z } from "zod";

export const CallsParserBaseType = z.object({
  callId: z.string(),
  roomId: z.string(),
  callerId: z.string(),
  date: z.date(),
  offline: z.boolean(),
  status: z.enum(["accept", "offer", "reject", "ringing", "terminate", "timeout"]),
  isVideo: z.boolean(),
  isGroup: z.boolean(),
});
