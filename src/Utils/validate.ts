import _ from 'lodash';
import fs from 'node:fs/promises';
import { store } from '../Modules/store';
import unorm from 'unorm';

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

    .replace(/\u202E(.*?)(\u202C|$)/gu, (_, content) => [...content].reverse().join(''))
    .replace(/\u202D(.*?)(\u202C|$)/gu, (_, content) => [...content].reverse().join(''))

    .replace(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu, '')
    .replace(/[\u200B\u200C\u200D\uFEFF]/gu, '')
    .replace(/[\u00AD\u034F\u115F\u1160\u17B4\u17B5\u180B-\u180E]/gu, '')
    .replace(/[\u2060-\u2064\u206A-\u206F]/gu, '')
    .replace(/[\u2800\uFFFC\uFFFD]/gu, '')

    .replace(/[\uFE00-\uFE0F]/gu, '')

    .split('')
    .map((char) => unorm.nfkd(char))
    .join('')

    .replace(/[\u0300-\u036F]/gu, '')
    .replace(/[\u1AB0-\u1AFF]/gu, '')
    .replace(/[\u1DC0-\u1DFF]/gu, '')
    .replace(/[\u20D0-\u20FF]/gu, '')
    .replace(/[\uFE20-\uFE2F]/gu, '')

    .replace(/[\p{Cc}]/gu, '')
    .replace(/[\p{Cf}]/gu, '')
    .replace(/[\p{Co}]/gu, '')
    .replace(/[\p{Cn}]/gu, '')
    .replace(/[\p{Cs}]/gu, '')

    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/gu, ' ')
    .replace(/[\u2028\u2029]/gu, ' ')
    .replace(/[\t\r\n\f\v]/g, ' ')

    .split('')
    .map((char) => unorm.nfkc(char))
    .join('')

    .normalize('NFC')

    .replace(/\s+/g, ' ')
    .trim();

  return clean.length ? clean : null;
};
