import { URL_REGEX } from 'baileys';
import gradient from 'gradient-string';
import _ from 'lodash';
import { object } from 'zod';

export const logColor = (text: string, color: string[] | string = 'lime') => {
  if (Array.isArray(color)) {
    return gradient(color)(text);
  }

  return gradient([color, color])(text);
};

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
  for (const obj of arr || []) {
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

export const findNestedByKeys = (data: unknown, target: object | object[]) => {
  const search = (obj) => {
    if (_.isArray(obj)) return _.find(obj, search) ?? obj;
    if (!_.isObject(obj)) return null;

    if (_.find(Object.entries(target), ([k, v]) => obj[k] === v)) return obj;

    return _.find(_.values(obj), search) ?? obj;
  };

  return search(data);
};
