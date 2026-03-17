export const generateId = (input: string | string[]) => {
  let combinedString = Array.isArray(input) ? input.join('|') : String(input);
  let hash = 2166136261;
  const len = combinedString.length;
  for (let i = 0; i < len; i++) {
    hash ^= combinedString.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return 'Z4D3FC' + (hash >>> 0).toString(16).padStart(8, '0').toUpperCase();
};

export const ignoreLint = (anyObj: any) => anyObj as any;
