import { sendError } from "./error";

export const toJson = <T = unknown>(object: unknown): T => {
  try {
    return JSON.parse(object as string) as T;
  } catch {
    return JSON.parse(JSON.stringify(object) || "{}") as T;
  }
};

export const toString = (object: unknown) => {
  try {
    return JSON.stringify(object);
  } catch {
    return JSON.stringify(toJson(object) || {});
  }
};

export const shuffleString = (str: string) => {
  const arr = [...str];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join("");
};

export const tryAgain = async <T>(fn: () => Promise<T>) => {
  const RETRY_DELAY = 200;
  const MAX_RETRIES = 10;

  for (let x = 0; x < MAX_RETRIES; x++) {
    try {
      return await (fn)();
    } catch (e) {
      console.log("e :", e);
      await new Promise((r) => setTimeout(r, RETRY_DELAY));
    }
  }
  throw sendError("Max retries reached");
};

export const findWord = (text = "", word = "") => {
  if (!text) return null;
  return text.toLowerCase().includes(word.toLowerCase());
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

export const getDevice = (chatId: string) => {
  if (!chatId) return "unknown";
  const device = chatId?.split(":")[1]?.split("@")[0];
  switch (device) {
    case "1":
      return "android";
    case "2":
      return "ios";
    case "3":
      return "desktop";
    case "4":
      return "web";
    default:
      return "unknown";
  }
};

export const getMentions = (text = "") => {
  if (!text) return [];
  const ids = new Set();
  for (const match of text.matchAll(/@(\d+)/g)) {
    ids.add(match[1]);
  }
  return [...ids] as string[];
};
