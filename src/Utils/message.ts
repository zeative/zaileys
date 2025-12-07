import { extractMessageContent, getContentType, proto } from 'baileys';
import _ from 'lodash';

export const generateId = (input: string | string[]) => {
  let combinedString;

  if (Array.isArray(input)) {
    combinedString = input.join('|');
  } else if (typeof input === 'string') {
    combinedString = input;
  } else {
    combinedString = String(input);
  }

  let hash = 2166136261;
  const len = combinedString.length;

  for (let i = 0; i < len; i++) {
    hash ^= combinedString.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return 'Z4CD' + (hash >>> 0).toString(16).padStart(8, '0').toUpperCase();
};

export const getUsersMentions = (text = '') => {
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
    if (match[1].length <= 15) ids.add(match[1]);
  }
  return _.flatMap([...ids], (id) => [`${id}@s.whatsapp.net`, `${id}@g.us`, `${id}@lid`]);
};

export const cleanMediaObject = (object: any) => {
  return _.omit(object, [
    'url',
    'contextInfo',
    'fileSha256',
    'fileEncSha256',
    'mediaKey',
    'directPath',
    'waveform',
    'thumbnail',
    'jpegThumbnail',
    'thumbnailEncSha256',
    'thumbnailSha256',
    'thumbnailDirectPath',
    'firstFrameSidecar',
    'streamingSidecar',
    'scansSidecar',
    'callKey',
    'message',
    'key',
    'midQualityFileSha256',
    'historySyncNotification',
    'appStateSyncKeyShare',
    'appStateSyncKeyRequest',
    'initialSecurityNotificationSettingSync',
    'appStateFatalExceptionNotification',
    'disappearingMode',
    'peerDataOperationRequestMessage',
    'peerDataOperationRequestResponseMessage',
    'botFeedbackMessage',
  ]);
};

export const getDeepContent = (raw?: proto.IMessage | null) => {
  if (!raw) return { leaf: undefined, chain: [] as string[] };

  let current: any = extractMessageContent(raw) || raw;
  const chain: string[] = [];

  while (current && typeof current === 'object') {
    const type = getContentType(current);
    if (!type) break;

    chain.push(type);
    const next = current[type];

    if (!next || typeof next !== 'object') {
      current = next;
      break;
    }

    current = next;
  }

  return { leaf: current, chain };
};

export const cleanJid = (jid: string) => {
  return Number(jid?.split('@')[0]);
};
