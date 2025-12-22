import z from 'zod';
import { fromError } from 'zod-validation-error';

export const parseZod = <T>(schema: z.ZodSchema<T>, data: unknown) => {
  try {
    return schema.parse(data);
  } catch (error) {
    const validation = fromError(error);
    throw new Error(validation.toString());
  }
};
