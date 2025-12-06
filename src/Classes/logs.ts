import z from 'zod';
import { store } from '../Modules/store';
import { ListenerMessagesType } from '../Types/messages';
import { cleanJid, ignoreLint, logColor } from '../Utils';
import { Client } from './client';

export class Logs {
  private ready = false;

  constructor(private client: Client) {
    this.initialize();
  }

  getRoomColor(validator) {
    if (validator?.isNewsletter) return 'blue';
    if (!validator?.isGroup) return 'orange';
    if (validator?.isGroup) return 'lime';

    return '#383838ff';
  }

  initialize() {
    if (!this.client.options.showLogs) return;

    store.events.on('connection', (data) => {
      if (data?.status === 'open') this.ready = true;

      if (this.ready) {
        console.log();
        store.spinner.info('Logs Indicator:');

        console.log(logColor('  •', 'orange') + ' Private Chat');
        console.log(logColor('  •', 'lime') + ' Group Chat');
        console.log(logColor('  •', 'blue') + ' Newsletter Chat');

        console.log();
      }
    });
  }

  message(message: Partial<z.infer<typeof ListenerMessagesType>>) {
    if (!this.ready) return;

    const color = ignoreLint(this.getRoomColor(message));
    const isMatch = message?.text?.toLowerCase()?.match('zaileys');

    const timestamp = logColor(`[${new Date(message?.timestamp).toTimeString().split(' ')[0]}]`, '#383838ff');
    const sender = logColor(`${message?.roomName}`, color);

    const text = message?.text?.slice(0, 300) || '';
    const dots = text?.length >= 300 ? '...' : '';

    let output = `${timestamp} → ${sender}\n`;

    if (message?.isNewsletter) {
      output += `${logColor(`[room]`, '#383838ff')} → ${logColor(`${message?.roomName} (${cleanJid(message?.roomId)})`, color)}\n`;
    } else {
      output += `${logColor(`[sender]`, '#383838ff')} → ${logColor(`${message?.senderName} (${cleanJid(message?.senderId)})`, color)}\n`;
    }

    output += `${logColor(`[${message?.chatType}]`, '#383838ff')} → ${logColor(text + dots, isMatch ? ['#ff5f6d', '#ffc371'] : 'brown')}\n`;
    output += `—`;

    console.log(output);
  }
}
