import pino from 'pino';
import { Client } from '../Classes/client';
import { KeysDatabase } from '../Config/database';
import { store } from '../Store';

export class HealthManager {
  private keysDb: ReturnType<typeof KeysDatabase>;

  constructor(private client: Client) {
    this.keysDb = KeysDatabase(client.options.session);
  }

  async repair(jid: string) {
    if (!jid) return;

    try {
      const socket = this.client.socket;
      if (socket && socket.authState) {
        await socket.authState.keys.set({
          'session': { [jid]: null },
          'sender-key': { [jid]: null }
        });

        store.spinner.warn(` [HealthManager] Repaired session for ${jid} due to Bad MAC by clearing auth cache`);
      }
    } catch (err) {
      this.logger.error({ err }, 'Failed to repair session');
    }
  }

  get logger() {
    return pino(
      {
        level: 'silent',
      },
      {
        write: (msg: string) => {
          try {
            const data = JSON.parse(msg);
            const rawMsg = data.msg || '';
            const blacklisted = [
              'Bad MAC',
              'Session error:',
              'Closing open session in favor of incoming prekey bundle',
              'Error: Bad MAC',
            ];

            if (rawMsg.includes('Bad MAC')) {
              const jid = data.jid || data.remoteJid;
              if (jid) {
                this.repair(jid);
              }
            }

            if (!blacklisted.some(term => rawMsg.includes(term))) {
              if (data.level >= 50 && data.err) { // Error level
                console.error(data.err);
              }
            }
          } catch {
            // ignore
          }
        },
      },
    );
  }
}
