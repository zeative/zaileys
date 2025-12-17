import makeWASocket from 'baileys';
import { Client } from '../Classes';
import { socketConfig } from '../Config/socket';
import { store } from '../Modules/store';
import { useAuthState } from './state';
import { cleanupSocket, getExistingSocket } from '../Utils/session';

export const registerAuthCreds = async (client: Client) => {
  const existingSocket = getExistingSocket();

  if (existingSocket) {
    cleanupSocket(existingSocket);
  }

  const SESSION_PATH = `.session/${client.options.session}`;

  console.info = () => {};

  const { state, saveCreds } = await useAuthState(SESSION_PATH);

  const config = socketConfig(client, state);
  const socket = makeWASocket(config);

  socket.ev.on('creds.update', saveCreds);

  store.set('socket', socket);
};
