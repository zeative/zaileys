import makeWASocket, { AuthenticationState, makeCacheableSignalKeyStore } from 'baileys';
import NodeCache from 'node-cache';
import { Client } from '../Classes';
import { store } from '../Modules/store';

const cache = new NodeCache();

export const socketConfig = (client: Client, state: AuthenticationState): Parameters<typeof makeWASocket>[0] => {
  return {
    logger: store.logger,
    printQRInTerminal: false,

    markOnlineOnConnect: client.options.autoOnline,
    syncFullHistory: client.options.syncFullHistory,

    msgRetryCounterCache: new NodeCache(),
    mediaCache: new NodeCache({ stdTTL: 60 }),

    cachedGroupMetadata: async (jid: string) => cache.get(jid),

    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, store.logger),
    },

    getMessage: async (key) => {
      if (!key?.remoteJid) return undefined;
      const messages = await client.db('messages').get(key.remoteJid);
      const message = messages?.find((item) => item?.key?.id === key.id);

      return message;
    },
  };
};
