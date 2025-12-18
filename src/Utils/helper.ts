import { URL_REGEX } from 'baileys';
import gradient from 'gradient-string';
import _ from 'lodash';

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
  const getNested = (obj: any, path: string): any => {
    if (!obj || typeof obj !== 'object') return undefined;
    let current = obj;
    for (const key of path.split('.')) {
      current = current?.[key];
      if (current === undefined || current === null) return undefined;
    }
    return current;
  };

  for (const obj of arr || []) {
    if (obj && typeof obj === 'object') {
      for (const key of keys) {
        const value = getNested(obj, key);
        if (value !== undefined && value !== null) return value;
      }
    }
  }
  return undefined;
};

export const findNestedByKeys = (data: unknown, target: Record<string, any> | Record<string, any>[]) => {
  const targets = _.castArray(target);

  const matchAll = (obj: any, t: Record<string, any>) => _.every(t, (v, k) => obj?.[k] === v);

  const matchAny = (obj: any, t: Record<string, any>) => _.some(t, (v, k) => obj?.[k] === v);

  const search = (obj: any): any => {
    if (_.isArray(obj)) return _.find(obj, search) ?? obj;
    if (!_.isObject(obj)) return null;

    const fullMatch = _.find(targets, (t) => matchAll(obj, t));
    if (fullMatch) return obj;

    const partialMatch = _.find(targets, (t) => matchAny(obj, t));
    if (partialMatch) return obj;

    return _.find(_.values(obj), search) ?? obj;
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
