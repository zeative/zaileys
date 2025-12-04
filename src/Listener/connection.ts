import makeWASocket, { delay, DisconnectReason, jidNormalizedUser } from 'baileys';
import { cristal } from 'gradient-string';
import z from 'zod';
import { Client } from '../Classes';
import { store } from '../Modules/store';
import { ListenerConnectionType } from '../Types/connection';
import { ignoreLint, removeAuthCreds } from '../Utils';
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
    const retry = async () => {
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
        output.authTimeout = Date.now() + 60_000;

        const expired = new Date(output.authTimeout).toLocaleTimeString();
        const code = await socket.requestPairingCode(this.client.options.phoneNumber.toString());

        store.spinner.warn(` Pairing expired at ${cristal(expired)}`);
        store.spinner.warn(` Pairing code: ${code}`);

        output.code = code;
      } catch {
        await retry();
      }
    }

    socket.ev.on('connection.update', async (ctx) => {
      const { connection, lastDisconnect, qr } = ctx;

      output.status = connection || 'connecting';
      output.authType = this.client.options.authType;

      store.spinner.update(' Connection status: ' + cristal(output.status));

      // QR handler
      if (this.client.options.authType === 'qr' && qr) {
        output.authTimeout = Date.now() + 60_000;

        const expired = new Date(output.authTimeout).toLocaleTimeString();

        store.spinner.warn(` Please scan the QR code...`);
        store.spinner.warn(` Qr code expired at ${cristal(expired)}`);

        autoDisplayQRCode(qr);

        output.qr = qr;
        return;
      }

      if (connection === 'close') {
        const code = ignoreLint(lastDisconnect?.error)?.output?.statusCode;
        const error = lastDisconnect?.error?.message || '';

        const isReconnect = typeof code === 'number' && code !== DisconnectReason.loggedOut;

        store.spinner.error(`[${code} - Closed] ${error}`);

        if (code === 401 || code === 405 || code === 500) {
          store.spinner.error(' Invalid session, please delete manually!');
          store.spinner.error(` Session "${this.client.options.session}" has not valid, please delete it!\n`);

          await retry();
        }

        if (isReconnect) {
          await reload();
        }
      }

      if (connection === 'open') {
        if (socket.user?.id) {
          const id = jidNormalizedUser(socket.user.id).split('@')[0];
          const name = socket.user.name || socket.user.verifiedName;

          store.spinner.success(` Connected as ${cristal(name || id)}`);
        } else {
          store.spinner.success(` Connected!`);
        }
      }

      store.events.emit('connection', output);
    });

    socket.ev.on('messaging-history.set', ({ progress }) => {
      output.status = 'syncing';
      output.syncProgress = progress;

      store.spinner.start(` Syncing messages history...`);

      if (progress) {
        store.spinner.update(` Syncing messages history ${progress + '%'}`);
      }

      if (progress == 100) {
        store.spinner.success(` Syncing messages history completed!`);
        output.syncCompleted = true;
      }

      store.set('connection', output);
      store.events.emit('connection', output);
    });
  }
}
