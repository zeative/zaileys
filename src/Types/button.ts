import * as v from 'valibot';

export const ButtonInteractiveReplyType = v.object({
  type: v.literal('quick_reply'),
  text: v.string(),
});

export const ButtonInteractiveUrlType = v.object({
  type: v.literal('cta_url'),
  url: v.pipe(v.string(), v.url()),
  text: v.string(),
});

export const ButtonInteractiveCopyType = v.object({
  type: v.literal('cta_copy'),
  copy: v.string(),
  text: v.string(),
});

export const ButtonInteractiveCallType = v.object({
  type: v.literal('cta_call'),
  text: v.string(),
  phoneNumber: v.string(),
});

export const ButtonInteractiveSingleSelectType = v.object({
  type: v.literal('single_select'),
  text: v.string(),
  section: v.array(v.object({
    title: v.string(),
    highlight_label: v.optional(v.string()),
    rows: v.array(v.object({
      id: v.string(),
      title: v.string(),
      header: v.optional(v.string()),
      description: v.optional(v.string()),
    })),
  })),
});

export const ButtonInteractiveType = v.object({
  type: v.literal('interactive'),
  footer: v.optional(v.string()),
  data: v.array(v.union([ButtonInteractiveReplyType, ButtonInteractiveUrlType, ButtonInteractiveCopyType, ButtonInteractiveCallType, ButtonInteractiveSingleSelectType])),
});

export const ButtonSimpleType = v.object({
  type: v.literal('simple'),
  footer: v.optional(v.string()),
  data: v.array(v.object({
      id: v.string(),
      text: v.string(),
  })),
});

export const ButtonType = v.union([ButtonSimpleType, ButtonInteractiveType]);
