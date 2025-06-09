import { z } from "zod";
import { MessagesParserType } from "../parser/messages";

export const chatsGetMessage = MessagesParserType

export type chatsAdapter = {
  getMessage: (chatId: string) => Promise<z.infer<typeof chatsGetMessage> | null>;
};
