import makeWASocket from 'baileys';
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

  socket.ev.on('groups.update', async ([event]) => {
    const metadata = await socket.groupMetadata(event.id);
    store.groupCache.set(event.id, metadata);
  });

  socket.ev.on('group-participants.update', async (event) => {
    const metadata = await socket.groupMetadata(event.id);
    store.groupCache.set(event.id, metadata);
  });

  store.set('socket', socket);
};
