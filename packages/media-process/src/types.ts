import * as v from 'valibot';

export const StickerMetadataType = v.object({
  packageName: v.optional(v.string()),
  authorName: v.optional(v.string()),
  quality: v.optional(v.number()),
  shape: v.optional(v.union([v.literal('circle'), v.literal('rounded'), v.literal('oval'), v.literal('default')])),
});
