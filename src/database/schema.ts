import { z } from "zod";
import { llmMessagesTable, llmPersonalizationTable, llmRAGTable } from "../types/adapter/llms";

export const AuthSchema = z.object({
  session: z.string(),
  id: z.string(),
  value: z.string().nullable(),
});

export const ChatSchema = z.object({
  session: z.string(),
  id: z.string(),
  value: z.string().nullable(),
});

export const ContactSchema = z.object({
  session: z.string(),
  id: z.string(),
  value: z.string().nullable(),
});

export const MessageSchema = z.object({
  session: z.string(),
  id: z.string(),
  value: z.string().nullable(),
});

export type AuthTable = z.infer<typeof AuthSchema>;
export type ChatTable = z.infer<typeof ChatSchema>;
export type ContactTable = z.infer<typeof ContactSchema>;
export type MessageTable = z.infer<typeof MessageSchema>;
export type llmMessagesTable = z.infer<typeof llmMessagesTable>;
export type llmPersonalizationTable = z.infer<typeof llmPersonalizationTable>;
export type llmRAGTable = z.infer<typeof llmRAGTable>;

export type DB = {
  auth: AuthTable;
  chats: ChatTable;
  contacts: ContactTable;
  messages: MessageTable;
  llm_messages: llmMessagesTable;
  llm_personalization: llmPersonalizationTable;
  llm_rag: llmRAGTable;
};
