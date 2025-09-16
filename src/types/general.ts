import { z } from "zod/v4";

export type ExtractZod<T> = T extends z.ZodTypeAny ? z.infer<T> : never;

export const defaultBoolean = (state: boolean) => z.boolean().default(state).optional();
export const defaultString = (state: string) => z.string().default(state).optional();
