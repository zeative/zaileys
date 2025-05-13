import { z } from "zod";

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

export type DB = {
  auth: AuthTable;
  chats: ChatTable;
  contacts: ContactTable;
  messages: MessageTable;
};
