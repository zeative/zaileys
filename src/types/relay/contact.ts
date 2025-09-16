import { z } from "zod/v4";

export const RelayContactEnumType = z.enum(["text", "reply", "forward"]);

export const RelayContactType = z.object({
  fullname: z.string(),
  nickname: z.string().optional(),
  organization: z.string().optional(),
  role: z.string().optional(),
  email: z.email().optional(),
  whatsAppNumber: z.number(),
  callNumber: z.number().optional(),
  voiceNumber: z.number().optional(),
  website: z.url().optional(),
  homeAddress: z.string().optional(),
  workAddress: z.string().optional(),
  avatar: z.url().optional(),
  roomId: z.string().optional(),
});
