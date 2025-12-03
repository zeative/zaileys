import makeWASocket, { delay } from 'baileys';
import { Client } from '../Classes';
import { socketConfig } from '../Config/socket';
import { store } from '../Modules/store';
import { useAuthState } from './state';

export const registerAuthCreds = async (client: Client) => {
  const SESSION_PATH = `.session/${client.options.session}`;

  const { state, saveCreds } = await useAuthState(SESSION_PATH);

  const config = socketConfig(client, state);
  const socket = makeWASocket(config);

  socket.ev.on('creds.update', saveCreds);

  store.set('socket', socket);
  store.set('session_path', { path: SESSION_PATH });
};
