import z from 'zod';

export const ButtonInteractiveReplyType = z.object({
  type: z.literal('quick_reply'),
  text: z.string(),
});

export const ButtonInteractiveUrlType = z.object({
  type: z.literal('cta_url'),
  url: z.url(),
  text: z.string(),
});

export const ButtonInteractiveCopyType = z.object({
  type: z.literal('cta_copy'),
  copy: z.string(),
  text: z.string(),
});

export const ButtonInteractiveCallType = z.object({
  type: z.literal('cta_call'),
  text: z.string(),
  phoneNumber: z.string(),
});

export const ButtonInteractiveSingleSelectType = z.object({
  type: z.literal('single_select'),
  text: z.string(),
  section: z
    .object({
      title: z.string(),
      highlight_label: z.string().optional(),
      rows: z
        .object({
          id: z.string(),
          title: z.string(),
          header: z.string().optional(),
          description: z.string().optional(),
        })
        .array(),
    })
    .array(),
});

export const ButtonInteractiveType = z.object({
  type: z.literal('interactive'),
  footer: z.string().optional(),
  data: z
    .union([ButtonInteractiveReplyType, ButtonInteractiveUrlType, ButtonInteractiveCopyType, ButtonInteractiveCallType, ButtonInteractiveSingleSelectType])
    .array(),
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
