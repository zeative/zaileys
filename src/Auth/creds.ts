import makeWASocket from 'baileys';
import { Client } from '../Classes';
import { socketConfig } from '../Config/socket';
import { store } from '../Library/center-store';
import { useAuthState } from './state';

export const registerAuthCreds = async (client: Client) => {
  const SESSION_PATH = `.session/${client.options.session}`;

  console.info = () => {};

  const { state, saveCreds } = await useAuthState(SESSION_PATH);

  const config = socketConfig(client, state);
  const socket = makeWASocket(config);

  socket.ev.on('creds.update', saveCreds);

  store.set('socket', socket);
};
