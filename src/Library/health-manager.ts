import pino from 'pino';
import { Client } from '../Classes/client';
import { KeysDatabase } from '../Config/database';
import { store } from './center-store';

export class HealthManager {
  private keysDb: ReturnType<typeof KeysDatabase>;

  constructor(private client: Client) {
    this.keysDb = KeysDatabase(client.options.session);
  }

  async repair(jid: string) {
    if (!jid) return;

    const keys = [`session:${jid}`, `sender-key:${jid}`];

    try {
      const promises = keys.map(key => this.keysDb.remove(key));
      await Promise.all(promises);

      store.spinner.warn(` [HealthManager] Repaired session for ${jid} due to Bad MAC`);
    } catch {
      // ignore
    }
  }

  get logger() {
    return pino(
      {
        level: 'silent', // Setting level to silent globally for Baileys to silence libsignal noise
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

            // Trigger Bad MAC repairs if found
            if (rawMsg.includes('Bad MAC')) {
              const jid = data.jid || data.remoteJid;
              if (jid) {
                this.repair(jid);
              }
            }

            // Expose meaningful non-blacklisted logs locally if the log level is debug locally (otherwise muted)
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
