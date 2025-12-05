import z from 'zod';

export const parseZod = <T>(schema: z.ZodSchema<T>, data: unknown) => {
  const result = schema.safeParse(data);

  if (result.success) return result.data;

  console.error(z.treeifyError(result.error));

  throw 'Invalid data';
};
