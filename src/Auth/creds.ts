import makeWASocket, { delay } from 'baileys';
import { Client } from '../Classes';
import { socketConfig } from '../Config/socket';
import { store } from '../Modules/store';
import { useAuthState } from './state';

export const registerAuthCreds = async (client: Client) => {
  store.set('socket', {});

  const { state, saveCreds } = await useAuthState(`.session/${client.options.session}`);

  const config = socketConfig(client, state);
  const socket = makeWASocket(config);

  if (client.options.authType === 'pairing' && client.options.phoneNumber && !socket.authState.creds.registered) {
    console.log('Generating pairing code...');

    await delay(5000);

    if (client.options.authType === 'pairing') {
      const code = await socket.requestPairingCode(client.options.phoneNumber.toString());
      console.log(`Pairing code: ${code}`);
    }
  }

  socket.ev.on('creds.update', saveCreds);

  store.set('socket', socket);
};
