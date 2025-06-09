import { z } from "zod";

export const WebhooksParserBaseType = z.object({
  id: z.string(),
  method: z.enum(['GET', 'POST']),
  host: z.string().or(z.undefined()),
  referer: z.string().or(z.undefined()),
  date: z.string(),
  size: z.number().or(z.undefined()),
  data: z.object({
    query: z.record(z.string(), z.any()).or(z.null()),
    json: z.record(z.string(), z.any()).or(z.null()),
    form: z.record(z.string(), z.any()).or(z.null()),
    raw: z.string().or(z.null()),
  })
});
