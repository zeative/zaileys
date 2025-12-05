import { URL_REGEX } from 'baileys';
import _ from 'lodash';

export const ignoreLint = (data: any) => data;

export const toJson = (object: unknown) => {
  try {
    return JSON.parse(object as string);
  } catch {
    return _.attempt(() => JSON.parse(JSON.stringify(object) || '{}'));
  }
};

export const toString = (object: unknown) => {
  try {
    return JSON.stringify(object);
  } catch {
    const result = _.attempt(() => JSON.stringify(toJson(object) || '{}'));
    return _.isError(result) ? '{}' : result;
  }
};

export const shuffleString = (str = '') => {
  return _.shuffle(str).join('');
};

export const findGlobalWord = (text = '', word = '') => {
  if (!text) return null;
  return _.includes(text.toLowerCase(), word.toLowerCase());
};

export const extractUrls = (text = '') => {
  if (!text) return [];
  return _.castArray(text.match(URL_REGEX) || []);
};

export const randomize = (arr: string[]) => {
  return arr[Math.floor(Math.random() * arr.length)];
};

export const pickKeysFromArray = (arr: any[], keys: string[]): any => {
  for (const obj of arr) {
    if (obj && typeof obj === 'object') {
      for (const key of keys) {
        if (key in obj && obj[key] !== undefined && obj[key] !== null) {
          return obj[key];
        }
      }
    }
  }
  return undefined;
};
