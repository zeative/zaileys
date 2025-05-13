import { z } from "zod";
import { MessagesParserType } from "../parser/messages";
import { CallsParserBaseType } from "../parser/calls";

const EventConnectionType = z.object({
  status: z.enum(["connecting", "open", "close"]),
});

const EventMessagesType = MessagesParserType;
const EventCallType = CallsParserBaseType

const EventEnumType = z.enum(["connection", "messages", "calls"]);
export type EventEnumType = z.infer<typeof EventEnumType>;

export type EventCallbackType = {
  connection: (ctx: z.infer<typeof EventConnectionType>) => void;
  messages: (ctx: z.infer<typeof EventMessagesType>) => void;
  calls: (ctx: z.infer<typeof EventCallType>) => void;
};
