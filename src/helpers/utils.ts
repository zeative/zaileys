export const toJson = (object = "") => {
  try {
    return JSON.parse(object);
  } catch {
    return JSON.parse(JSON.stringify(object));
  }
};

export const toString = (object = {}) => {
  try {
    return JSON.stringify(object);
  } catch {
    return JSON.stringify(JSON.parse(JSON.stringify(object)));
  }
};

export const normalizeText = (text = "") => {
  if (!text) return null;
  return text.replace(/\u202E([\s\S]*?)\u202C/g, (_, segmen) => Array.from(segmen).reverse().join("")).replace(/[\u202A-\u202E\u202C]/g, "");
};

export const extractJids = (text = "") => {
  if (!text) return [];
  const ids = new Set();
  for (const match of text.matchAll(/@(\d+)/g)) {
    ids.add(match[1]);
  }
  return [...ids].flatMap((id) => [`${id}@s.whatsapp.net`, `${id}@g.us`]);
};

export const extractUrls = (text = "") => {
  if (!text) return [];
  const regex = /(?:https?:\/\/)?[^\s<>"']+\.[^\s<>"']+/g;
  return text.match(regex) || [];
};

export const getMentions = (text = "") => {
  if (!text) return [];
  const ids = new Set();
  for (const match of text.matchAll(/@(\d+)/g)) {
    ids.add(match[1]);
  }
  return [...ids] as string[];
};

export const findWord = (text = "", word = "") => {
  if (!text) return null;
  return text.toLowerCase().includes(word.toLowerCase());
};

export const removeKeys = <T extends Record<string, any>, K extends keyof any>(obj: T, keysToRemove: K[]): Partial<T> => {
  if (!obj || typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => removeKeys(item, keysToRemove)) as any;
  }

  return Object.fromEntries(
    Object.entries(obj)
      .filter(([key]) => !keysToRemove.includes(key as K))
      .map(([key, value]) => [key, typeof value === "object" ? removeKeys(value, keysToRemove) : value])
  ) as Partial<T>;
};
