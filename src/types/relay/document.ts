import { z } from "zod/v4";

export const RelayDocumentEnumType = z.enum(["text", "reply", "forward"]);

export const RelayDocumentType = z.object({
  document: z.url().or(z.base64()).or(z.instanceof(Buffer)),
  mimetype: z.string(),
  text: z.string().optional(),
  fileName: z.string().optional(),
  roomId: z.string().optional(),
});
