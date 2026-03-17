import makeWASocket, { AuthenticationState, Browsers, makeCacheableSignalKeyStore, proto } from 'baileys';
import { Client } from '../Classes';
import { LRUCacheAdapter } from '../Library/lru-adapter';
import { store, groupStore, cacheStore, msgStore } from '../Store';

export const socketConfig = (client: Client, state: AuthenticationState): Parameters<typeof makeWASocket>[0] => {
  return {
    logger: client.health.logger,
    printQRInTerminal: false,
    enableRecentMessageCache: true,
    emitOwnEvents: true,
    keepAliveIntervalMs: 30000,

    browser: Browsers.macOS('Desktop'),

    markOnlineOnConnect: client.options.autoOnline,
    syncFullHistory: client.options.syncFullHistory,

    msgRetryCounterCache: new LRUCacheAdapter(msgStore),
    mediaCache: new LRUCacheAdapter(cacheStore),

    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, store.logger),
    },

    cachedGroupMetadata: async (jid: string) => groupStore.get(jid),

    shouldIgnoreJid: () => false,

    shouldSyncHistoryMessage: () => client.options.syncFullHistory,

    patchMessageBeforeSending: (msg) => msg,

    getMessage: async (key) => {
      if (!key?.remoteJid || !key?.id) return proto.Message.fromObject({});

      const message = await client.db('messages').get(key.id);
      return proto.Message.fromObject(message || {});
    },
  };
};
