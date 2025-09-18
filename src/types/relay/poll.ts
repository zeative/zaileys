import { z } from "zod/v4";
import { defaultBoolean } from "../general";

export const RelayPollEnumType = z.enum(["text", "reply", "forward"]);

export const RelayPollCreateType = z.object({
  action: z.literal("create"),
  name: z.string(),
  answers: z.string().array(),
  isMultiple: defaultBoolean(false),
  roomId: z.string().optional(),
});

export const RelayPollResultType = z.object({
  action: z.literal("result"),
  name: z.string(),
  votes: z.tuple([z.string(), z.number()]).array(),
  roomId: z.string().optional(),
});

export const RelayPollType = z.discriminatedUnion("action", [RelayPollCreateType]);
