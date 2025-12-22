import pino from 'pino';
import { Client } from '../Classes/client';
import { KeysDatabase } from '../Config/database';
import { store } from './center-store';

export class HealthManager {
  private keysDb: ReturnType<typeof KeysDatabase>;

  constructor(private client: Client) {
    this.keysDb = KeysDatabase(client.options.session);
    this.setupLogFilters();
  }

  private setupLogFilters() {
    const originalError = console.error;
    const originalLog = console.log;

    const filter = (args: any[]) => {
      const msg = args.join(' ');
      const blacklisted = [
        'Bad MAC',
        'Session error:',
        'Closing open session in favor of incoming prekey bundle',
        'Error: Bad MAC',
      ];

      return blacklisted.some((term) => msg.includes(term));
    };

    console.error = (...args: any[]) => {
      if (filter(args)) return;
      originalError.apply(console, args);
    };

    console.log = (...args: any[]) => {
      if (filter(args)) return;
      originalLog.apply(console, args);
    };
  }

  async repair(jid: string) {
    if (!jid) return;

    const keys = [`session:${jid}`, `sender-key:${jid}`];

    try {
      await this.keysDb.batchDelete(keys);
      await this.keysDb.flush();

      store.spinner.warn(` [HealthManager] Repaired session for ${jid} due to Bad MAC`);
    } catch {
      // ignore
    }
  }

  get logger() {
    return pino(
      {
        level: 'debug',
      },
      {
        write: (msg: string) => {
          try {
            const data = JSON.parse(msg);
            if (data.msg?.includes('Bad MAC')) {
              const jid = data.jid || data.remoteJid;
              if (jid) {
                this.repair(jid);
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
