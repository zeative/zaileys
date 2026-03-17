import makeWASocket, { fetchLatestBaileysVersion } from 'baileys';
import { Client } from '../Classes';
import { socketConfig } from '../Config/socket';
import { centerStore } from '../Store';
import { useAuthState } from './state';

export const registerAuthCreds = async (client: Client) => {
  const SESSION_ID = client.options.session || 'zaileys';

  const { state, saveCreds } = await useAuthState(SESSION_ID);
  const { version } = await fetchLatestBaileysVersion();

  const config = socketConfig(client, state);
  const socket = makeWASocket({
    ...config,
    version,
  });

  socket.ev.on('creds.update', saveCreds);

  centerStore.set('socket', socket);
};
