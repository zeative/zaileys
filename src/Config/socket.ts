import makeWASocket, { Browsers, makeCacheableSignalKeyStore } from "baileys";
import NodeCache from "node-cache";
import { Client } from "../Classes";

const cache = new NodeCache();

export const socketConfig = (props: Client, auth: any): Parameters<typeof makeWASocket>[0] => {
  const browser = props.options.authType == "qr" ? Browsers.ubuntu("Zaileys Browser") : undefined;

  return {
    logger: undefined,
    browser,

    printQRInTerminal: false,
    defaultQueryTimeoutMs: undefined,

    markOnlineOnConnect: props.options.autoOnline,
    syncFullHistory: props.options.syncFullHistory,

    msgRetryCounterCache: new NodeCache(),
    mediaCache: new NodeCache({ stdTTL: 60 }),

    cachedGroupMetadata: async (jid: string) => cache.get(jid),

    auth: {
      creds: auth.creds,
      keys: makeCacheableSignalKeyStore(auth.keys, undefined),
    },
  };
};
