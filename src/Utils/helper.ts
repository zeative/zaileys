import { URL_REGEX } from "baileys";
import _ from "lodash";

export const toJson = (object: unknown) => {
  try {
    return JSON.parse(object as string);
  } catch {
    return _.attempt(() => JSON.parse(JSON.stringify(object) || "{}"));
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

export const shuffleString = (str = "") => {
  return _.shuffle(str).join("");
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

export const extractUrls = (text = "") => {
  if (!text) return [];
  return _.castArray(text.match(URL_REGEX) || []);
};

export const randomize = (arr: string[]) => {
  return arr[Math.floor(Math.random() * arr.length)];
};
