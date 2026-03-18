import makeWASocket, { delay, DisconnectReason, jidNormalizedUser } from 'baileys';
import { cristal } from 'gradient-string';
import { Client } from '../Classes';
import { store, centerStore } from '../Store';
import { ConnectionContext } from '../Types/connection';
import { ignoreLint, removeAuthCreds } from '../Utils';
import { autoDisplayQRCode } from '../Utils/banner';

export class Connection {
  constructor(private client: Client) {
    this.initialize();
  }

  async initialize() {
    store.spinner.start(' Initializing connection...');

    const socket = centerStore.get('socket') as ReturnType<typeof makeWASocket>;

    const output: Partial<ConnectionContext> = {};

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
        const error = lastDisconnect?.error?.message || 'Unknown Error';

        const displayCode = code ?? 'Internal';

        store.spinner.error(` [${displayCode} - Closed] ${error}`);

        if (code === DisconnectReason.loggedOut) {
          if (this.client.options.deleteSessionOnLogout) {
            store.spinner.warn(` Session logged out or invalidated. Self-healing...`);
            await removeAuthCreds(this.client.options.session);
            setTimeout(() => reload(), 3000);
          } else {
            store.spinner.warn(` Session logged out or invalidated. Automatic session deletion is disabled.`);
          }
          return;
        }

        if (code === 405) {
          store.spinner.warn(' Session invalid/stale or used by another device (405).');
          store.spinner.warn(` Automatic reconnecting...`);
          setTimeout(() => reload(), 3000);
          return;
        }

        if (code === 500) {
          store.spinner.error(' Server error occurred, attempting reconnect...');
          setTimeout(() => reload(), 3000);
          return;
        }

        const isReconnect = typeof code === 'number';

        if (isReconnect) {
          store.spinner.warn(` Connection marked for reconnect (${code}). Wait a moment...`);
          setTimeout(() => reload(), 3000);
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

      store.spinner.start(` Syncing messages history (bot is active and responding)...`);

      if (progress) {
        store.spinner.update(` Syncing messages history ${progress + '%'} (bot is active)`);
      }

      if (progress == 100) {
        store.spinner.success(` Syncing completed! All systems ready.`);
        output.syncCompleted = true;
      }

      store.events.emit('connection', output);
    });
  }
}
