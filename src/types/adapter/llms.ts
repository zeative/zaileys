import { z } from "zod";
import { randomChar, toJson } from "../../helpers/utils";

export const llmMessagesTable = z.object({
  channelId: z.string(),
  uniqueId: z.string(),
  model: z.string().min(2).max(100).optional().nullable(),
  role: z.string().min(2).max(100),
  content: z.string().min(1).max(65_000),
  additional: z.string().max(20_000).optional().nullable(),
});

export const llmPersonalizationTable = z.object({
  uniqueId: z.string(),
  senderId: z.string(),
  content: z.string().min(1).max(5_000),
});

export const llmRAGTable = z.object({
  metadata: z
    .object({
      id: z.string().default(() => randomChar(5)),
    })
    .default({}),
  pageContent: z.string().min(1).max(128_000),
});

export const addRAGType = llmRAGTable.pick({ pageContent: true });

export type llmsAdapter = {
  addCompletion: (props: z.infer<typeof llmMessagesTable>) => Promise<z.infer<typeof llmMessagesTable>>;
  deleteCompletion: (uniqueId: string) => Promise<boolean>;
  updateCompletion: (uniqueId: string, props: Partial<z.infer<typeof llmMessagesTable>>) => Promise<z.infer<typeof llmMessagesTable>>;
  clearCompletions: (channelId: string) => Promise<boolean>;
  getCompletion: (uniqueId: string) => Promise<z.infer<typeof llmMessagesTable> | null>;
  getCompletions: (channelId: string) => Promise<z.infer<typeof llmMessagesTable>[]>;

  addPersonalization: (props: z.infer<typeof llmPersonalizationTable>) => Promise<z.infer<typeof llmPersonalizationTable>>;
  deletePersonalization: (uniqueId: string) => Promise<boolean>;
  clearPersonalization: (senderId: string) => Promise<boolean>;
  getPersonalization: (senderId: string) => Promise<z.infer<typeof llmPersonalizationTable>[]>;

  addRAG: (props: z.infer<typeof addRAGType>) => Promise<z.infer<typeof llmRAGTable>>;
  deleteRAG: (id: string) => Promise<boolean>;
  updateRAG: (id: string) => Promise<z.infer<typeof llmRAGTable>>;
  clearRAGs: () => Promise<boolean>;
  getRAG: (id: string) => Promise<z.infer<typeof llmRAGTable> | null>;
  getRAGs: (keyword: string) => Promise<z.infer<typeof llmRAGTable>[]>;
};
