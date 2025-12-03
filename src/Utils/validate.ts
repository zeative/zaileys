import _ from 'lodash';
import fs from 'node:fs/promises';
import { store } from '../Modules/store';

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
    const SESSION_PATH = `.session/${session}/creds.json`;
    await fs.unlink(SESSION_PATH);
  } catch (error) {
    store.spinner.error(`Failed to remove auth creds for session "${session}"!`);
    throw error;
  }
};

export const getMentions = (text = '') => {
  if (!text) return [];
  const ids = new Set();
  for (const match of text.matchAll(/@(\d+)/g)) {
    ids.add(match[1]);
  }
  return _.toArray(ids) as string[];
};

export const extractJids = (text = '') => {
  if (!text) return [];
  const ids = new Set();
  for (const match of text.matchAll(/@(\d+)/g)) {
    ids.add(match[1]);
  }
  return _.flatMap([...ids], (id) => [`${id}@s.whatsapp.net`, `${id}@g.us`]);
};
