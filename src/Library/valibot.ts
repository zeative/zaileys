import * as v from 'valibot';

export const parseValibot = <T>(schema: any, data: unknown): T => {
  const result = v.safeParse(schema, data);
  if (result.issues) {
    throw new Error(JSON.stringify(v.flatten(result.issues), null, 2));
  }
  return result.output as T;
};
