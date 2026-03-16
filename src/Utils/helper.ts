import { URL_REGEX } from 'baileys';
import gradient from 'gradient-string';
import * as _ from 'radashi';

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
    const res = _.tryit(() => JSON.parse(JSON.stringify(object) || '{}'))();
    return res[1];
  }
};

export const toString = (object: unknown) => {
  try {
    return JSON.stringify(object);
  } catch {
    const res = _.tryit(() => JSON.stringify(toJson(object) || '{}'))();
    return res[0] ? '{}' : res[1];
  }
};

export const shuffleString = (str = '') => {
  return _.shuffle(str.split('')).join('');
};

export const findGlobalWord = (text = '', word = '') => {
  if (!text) return null;
  return text.toLowerCase().includes(word.toLowerCase());
};

export const extractUrls = (text = '') => {
  if (!text) return [];
  const matches = text.match(URL_REGEX) || [];
  return Array.isArray(matches) ? matches : [matches];
};

export const randomize = (arr: string[]) => {
  return arr[Math.floor(Math.random() * arr.length)];
};

export const pickKeysFromArray = (arr: any[], keys: string[]): any => {
  const isEmpty = (value: any): boolean => {
    if (value === undefined || value === null) return true;
    if (typeof value === 'string' && value.trim() === '') return true;
    if (Array.isArray(value) && value.length === 0) return true;
    if (typeof value === 'object' && Object.keys(value).length === 0) return true;
    return false;
  };

  const getNested = (obj: any, path: string): any => {
    if (!obj || typeof obj !== 'object') return undefined;

    let current = obj;
    const keys = path.split('.');

    for (const key of keys) {
      const arrayMatch = key.match(/^(.+?)\[(\d+)\]$/);

      if (arrayMatch) {
        const [, arrayKey, index] = arrayMatch;
        current = current?.[arrayKey]?.[parseInt(index, 10)];
      } else {
        current = current?.[key];
      }

      if (isEmpty(current)) return undefined;
    }

    return current;
  };

  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  if (!Array.isArray(keys) || keys.length === 0) return undefined;

  for (const obj of arr) {
    if (!obj || typeof obj !== 'object') continue;

    for (const key of keys) {
      const value = getNested(obj, key);

      if (!isEmpty(value)) {
        return value;
      }
    }
  }

  return undefined;
};

export const findNestedByKeys = (data: unknown, target: Record<string, any> | Record<string, any>[]) => {
  const targets = Array.isArray(target) ? target : [target];

  const matchAll = (obj: any, t: Record<string, any>) => Object.entries(t).every(([k, v]) => obj?.[k] === v);

  const matchAny = (obj: any, t: Record<string, any>) => Object.entries(t).some(([k, v]) => obj?.[k] === v);

  const search = (obj: any): any => {
    if (Array.isArray(obj)) return obj.find(search) ?? obj;
    if (!_.isObject(obj)) return null;

    const fullMatch = targets.find((t) => matchAll(obj, t));
    if (fullMatch) return obj;

    const partialMatch = targets.find((t) => matchAny(obj, t));
    if (partialMatch) return obj;

    return Object.values(obj).find(search) ?? obj;
  };

  return search(data);
};

export const modifyFn = <T extends (...args: any[]) => any>(fn: T, before?: (args: any[]) => void | any, after?: (result: any, args: any[]) => any): T => {
  return new Proxy(fn, {
    apply(target, thisArg, args) {
      before?.(args);
      const result = Reflect.apply(target, thisArg, args);
      return after ? after(result, args) : result;
    },
  }) as T;
};

export const escapeRegExp = (text: string) => {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
};
