import _ from 'lodash';
import fs from 'node:fs/promises';
import { store } from '../Modules/store';

export const ignoreLint = (data: any) => data;

export const getLatestLibVersion = async () => {
  try {
    const res = await fetch('https://registry.npmjs.org/zaileys');
    const data = await res.json();

    return data['dist-tags'].latest;
  } catch (error) {
    throw error;
  }
};

export const removeAuthCreds = async (session: string) => {
  try {
    const SESSION_PATH = `.session/${session}/auth/creds.json`;
    await fs.unlink(SESSION_PATH);
  } catch (error) {
    store.spinner.error(`Failed to remove auth creds for session "${session}"!`);
    throw error;
  }
};

export const normalizeText = (text = '') => {
  if (!text?.length) return null;

  let clean = text
    .normalize('NFKD')
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF\uFFF9-\uFFFB]/gu, '')
    .replace(
      /[\u0300-\u036F\u0483-\u0489\u0591-\u05BD\u05BF\u05C1-\u05C2\u05C4-\u05C7\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7-\u06E8\u06EA-\u06ED\u20D0-\u20FF\uFE20-\uFE2F]/gu,
      '',
    )
    .replace(/[\u202A-\u202E\u2066-\u2069]/gu, '')
    .replace(/\u202E([\s\S]*?)\u202C?/gu, (_, s) => [...s].reverse().join(''));

  return clean;
};
