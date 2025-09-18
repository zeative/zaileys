import { sendError } from "./error";
import _ from "lodash";

export const toJson = <T = unknown>(object: unknown): T => {
  try {
    return JSON.parse(object as string) as T;
  } catch {
    return _.attempt(() => JSON.parse(JSON.stringify(object) || "{}")) as T;
  }
};

export const toString = (object: unknown) => {
  try {
    return JSON.stringify(object);
  } catch {
    const result = _.attempt(() => JSON.stringify(toJson(object) || "{}"));
    return _.isError(result) ? "{}" : result;
  }
};

export const shuffleString = (str: string) => {
  return _.shuffle([...str]).join("");
};

export const tryAgain = async <T>(fn: () => Promise<T>) => {
  const RETRY_DELAY = 200;
  const MAX_RETRIES = 10;

  for (let x = 0; x < MAX_RETRIES; x++) {
    try {
      return await fn();
    } catch (_e) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY));
    }
  }
  throw sendError("Max retries reached");
};

export const findWord = (text = "", word = "") => {
  if (!text) return null;
  return _.includes(text.toLowerCase(), word.toLowerCase());
};

export const normalizeText = (text = "") => {
  if (!text) return null;
  return _.replace(text, /\u202E([\s\S]*?)\u202C/g, (_e, segmen) => {
    const arr = _.toArray(segmen);
    const reversed = _.reverse(_.clone(arr));
    return _.join(reversed, "");
  }).replace(/[\u202A-\u202E\u202C]/g, "");
};

export const extractJids = (text = "") => {
  if (!text) return [];
  const ids = new Set();
  for (const match of text.matchAll(/@(\d+)/g)) {
    ids.add(match[1]);
  }
  return _.flatMap([...ids], (id) => [`${id}@s.whatsapp.net`, `${id}@g.us`]);
};

export const extractUrls = (text = "") => {
  if (!text) return [];
  const regex = /https?:\/\/(?:[-\w.])+(?:\.[a-zA-Z]{2,})+(?:\/[^\s<>"']*)?/g;
  return _.castArray(text.match(regex) || []);
};

export const getMentions = (text = "") => {
  if (!text) return [];
  const ids = new Set();
  for (const match of text.matchAll(/@(\d+)/g)) {
    ids.add(match[1]);
  }
  return _.toArray(ids) as string[];
};
