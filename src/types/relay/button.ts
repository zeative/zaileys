import { z } from "zod/v4";

export const RelayButtonEnumType = z.enum(["text", "reply", "forward"]);

export const RelayButtonSimpleType = z.object({
  type: z.literal("simple"),
  text: z.string(),
  footer: z.string().optional(),
  buttons: z
    .object({
      id: z.string(),
      text: z.string(),
    })
    .array(),
  roomId: z.string().optional(),
});

export const RelayButtonInteractiveReplyType = z.object({
  type: z.literal("quick_reply"),
  id: z.string(),
  text: z.string(),
});

export const RelayButtonInteractiveUrlType = z.object({
  type: z.literal("cta_url"),
  id: z.string(),
  url: z.url(),
  text: z.string(),
});

export const RelayButtonInteractiveCopyType = z.object({
  type: z.literal("cta_copy"),
  id: z.string(),
  copy: z.string(),
  text: z.string(),
});

export const RelayButtonInteractiveCallType = z.object({
  type: z.literal("cta_call"),
  id: z.string(),
  phoneNumber: z.string(),
  text: z.string(),
});

export const RelayButtonInteractiveType = z.object({
  type: z.literal("interactive"),
  text: z.string(),
  footer: z.string().optional(),
  buttons: z.discriminatedUnion("type", [RelayButtonInteractiveReplyType, RelayButtonInteractiveUrlType, RelayButtonInteractiveCopyType, RelayButtonInteractiveCallType]).array(),
  roomId: z.string().optional(),
});

export const RelayButtonlistType = z.object({
  type: z.literal("list"),
  text: z.string(),
  footer: z.string(),
  roomId: z.string().optional(),
});

export const RelayButtonType = z.discriminatedUnion("type", [RelayButtonSimpleType, RelayButtonInteractiveType]);
