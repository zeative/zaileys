import z from 'zod';

export const ButtonEnumType = z.enum(['text', 'reply', 'forward']);

export const ButtonInteractiveReplyType = z.object({
  type: z.literal('quick_reply'),
  id: z.string(),
  text: z.string(),
});

export const ButtonInteractiveUrlType = z.object({
  type: z.literal('cta_url'),
  id: z.string(),
  url: z.url(),
  text: z.string(),
});

export const ButtonInteractiveCopyType = z.object({
  type: z.literal('cta_copy'),
  id: z.string(),
  copy: z.string(),
  text: z.string(),
});

export const ButtonInteractiveCallType = z.object({
  type: z.literal('cta_call'),
  id: z.string(),
  text: z.string(),
  phoneNumber: z.string(),
});

export const ButtonInteractiveType = z.object({
  type: z.literal('interactive'),
  footer: z.string().optional(),
  data: z.union([ButtonInteractiveReplyType, ButtonInteractiveUrlType, ButtonInteractiveCopyType, ButtonInteractiveCallType]).array(),
});

export const ButtonSimpleType = z.object({
  type: z.literal('simple'),
  footer: z.string().optional(),
  data: z
    .object({
      id: z.string(),
      text: z.string(),
    })
    .array(),
});

export const ButtonType = z.union([ButtonSimpleType, ButtonInteractiveType]);
