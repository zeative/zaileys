import z from "zod";

export const parseZod = <T>(schema: z.ZodSchema<T>, data: unknown) => {
  const result = schema.safeParse(data);

  if (result.success) return result.data;

  console.log();
  console.error(z.prettifyError(result.error));

  throw new Error("Invalid data");
};
``;
