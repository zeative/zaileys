import makeWASocket, { delay, DisconnectReason, jidNormalizedUser } from 'baileys';
import { cristal } from 'gradient-string';
import z from 'zod';
import { Client } from '../Classes';
import { store } from '../Modules/store';
import { ListenerConnectionType } from '../Types/connection';
import { removeAuthCreds, toJson } from '../Utils';
import { autoDisplayQRCode } from '../Utils/banner';

export class Connection {
  constructor(private client: Client) {
    this.initialize();
  }

  async initialize() {
    store.spinner.start(' Initializing connection...');

    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;

    const output: Partial<z.infer<typeof ListenerConnectionType>> = {};

    // Reload client
    const reload = async () => {
      output.status = 'reload';
      store.spinner.warn(' Connection lost. Attempting auto-reload...');

      await this.client.initialize();
    };

    // Retry handler
    const retry = async (error) => {
      await delay(3000);

      store.spinner.warn(` Invalid session. Attempting auto cleaning creds...`);
      await delay(3000);

      await removeAuthCreds(this.client.options.session);
      await reload();
    };

    // Pairing handler
    if (this.client.options.authType === 'pairing' && this.client.options.phoneNumber && !socket.authState.creds.registered) {
      store.spinner.update(' Generating pairing code...');

      await delay(3500);

      try {
        const expired = new Date(Date.now() + 60_000).toLocaleTimeString();
        const code = await socket.requestPairingCode(this.client.options.phoneNumber.toString());

        store.spinner.warn(` Pairing expired at ${cristal(expired)}`);
        store.spinner.warn(` Pairing code: ${code}`);
      } catch (error) {
        await retry(error);
      }
    }

    socket.ev.on('connection.update', async (ctx) => {
      const { connection, lastDisconnect, qr } = ctx;

      output.status = connection || 'connecting';
      store.spinner.update(' Connection status: ' + cristal(output.status));

      output.authType = this.client.options.authType;

      // QR handler
      if (this.client.options.authType === 'qr' && qr) {
        const expired = new Date(Date.now() + 60_000).toLocaleTimeString();

        store.spinner.warn(` Please scan the QR code...`);
        store.spinner.warn(` Qr code expired at ${cristal(expired)}`);

        autoDisplayQRCode(qr);
        return;
      }

      if (connection === 'close') {
        const code = toJson(lastDisconnect?.error)?.output?.statusCode;
        const error = lastDisconnect?.error?.message || '';

        const isReconnect = typeof code === 'number' && code !== DisconnectReason.loggedOut;

        store.spinner.error(`[${code} - Closed] ${error}`);

        if (code === 401 || code === 405 || code === 500) {
          store.spinner.error(' Invalid session, please delete manually!');
          store.spinner.error(` Session "${this.client.options.session}" has not valid, please delete it!\n`);

          await retry('Invalid session!');
        }

        if (isReconnect) {
          await reload();
        }
      }

      if (connection === 'open') {
        const id = jidNormalizedUser(socket.user?.id).split('@')[0];
        const name = socket.user?.name || socket.user?.verifiedName;

        store.spinner.success(` Connected as ${cristal(name || id)}`);
      }

      store.events.emit('connection', output);
    });
  }
}
