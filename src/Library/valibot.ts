import * as v from 'valibot';

export const parseValibot = <T>(schema: any, data: unknown): T => {
  const result = v.safeParse(schema, data);
  if (result.issues) {
    const messages: string[] = [];
    const extract = (issueList: any[]) => {
      for (const issue of issueList) {
        if (issue.issues && issue.issues.length > 0) {
          extract(issue.issues);
        } else {
          const path = issue.path?.map((p: any) => p.key).join('.') || 'root';
          messages.push(`${path}: ${issue.message}`);
        }
      }
    };
    extract(result.issues);
    
    const uniqueMessages = Array.from(new Set(messages));
    throw new Error(`Validation Error:\n  - ${uniqueMessages.join('\n  - ')}`);
  }
  return result.output as T;
};
