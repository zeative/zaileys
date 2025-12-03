import makeWASocket, { delay, DisconnectReason, jidNormalizedUser } from 'baileys';
import { cristal } from 'gradient-string';
import z from 'zod';
import { Client } from '../Classes';
import { store } from '../Modules/store';
import { ListenerConnectionType } from '../Types/connection';
import { toJson } from '../Utils';
import { autoDisplayQRCode } from '../Utils/banner';
import fs from 'node:fs/promises';
import { join } from 'node:path';

export class Connection {
  constructor(private client: Client) {
    this.initialize();
  }

  async initialize() {
    store.spinner.start(' Initializing connection...');

    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;

    const output: Partial<z.infer<typeof ListenerConnectionType>> = {};

    socket.ev.on('connection.update', async (ctx) => {
      const { connection, lastDisconnect, qr } = ctx;

      output.status = connection || 'connecting';
      store.spinner.update(' Connection status: ' + cristal(output.status));

      output.authType = this.client.options.authType;

      if (this.client.options.authType === 'qr' && qr) {
        const expired = new Date(Date.now() + 60_000).toLocaleTimeString();

        store.spinner.warn(` Please scan the QR code...`);
        store.spinner.warn(` Qr code expired at ${cristal(expired)}`);

        autoDisplayQRCode(qr);
        return;
      }

      const reload = async () => {
        output.status = 'reload';
        store.spinner.warn(' Connection lost. Attempting auto-reload...');

        await this.client.initialize();
      };

      if (connection === 'close') {
        const code = toJson(lastDisconnect?.error)?.output?.statusCode;
        const error = lastDisconnect?.error?.message || '';

        const isReconnect = typeof code === 'number' && code !== DisconnectReason.loggedOut;

        store.spinner.error(`[${code} - Closed] ${error}`);

        if (code === 401 || code === 405 || code === 500) {
          store.spinner.error(' Invalid session, please delete manually!');
          store.spinner.error(` Session "${this.client.options.session}" has not valid, please delete it!\n`);

          throw 'Invalid session';
        }

        if (isReconnect) {
          await reload();
        }
      }

      if (connection === 'open') {
        if (!socket.user) return await this.client.initialize();

        const id = jidNormalizedUser(socket.user.id).split('@')[0];
        const name = socket.user.name || socket.user.verifiedName;

        store.spinner.success(` Connected as ${cristal(name || id)}`);
      }

      store.events.emit('connection', output);
    });
  }
}
