import makeWASocket, { AuthenticationState, Browsers, makeCacheableSignalKeyStore, proto } from 'baileys';
import { Client } from '../Classes';
import { store } from '../Library/center-store';
import { groupCache, mediaCache, msgRetryCache } from './cache';

export const socketConfig = (client: Client, state: AuthenticationState): Parameters<typeof makeWASocket>[0] => {
  return {
    logger: store.logger,
    printQRInTerminal: false,
    enableRecentMessageCache: true,
    emitOwnEvents: true,
    keepAliveIntervalMs: 30000,

    browser: Browsers.ubuntu('Chrome'),

    markOnlineOnConnect: client.options.autoOnline,
    syncFullHistory: client.options.syncFullHistory,

    msgRetryCounterCache: msgRetryCache,
    mediaCache: mediaCache,

    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, store.logger),
    },

    cachedGroupMetadata: async (jid: string) => groupCache.get(jid),

    shouldIgnoreJid: () => false,

    shouldSyncHistoryMessage: () => client.options.syncFullHistory,

    patchMessageBeforeSending: (msg) => msg,

    getMessage: async (key) => {
      if (!key?.remoteJid) return proto.Message.fromObject({});

      const message = await client.db('messages').getByIndex('messages', 'key.id', key.id);
      return proto.Message.fromObject(message[0]);
    },
  };
};
