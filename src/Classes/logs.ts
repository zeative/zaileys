import z from 'zod';
import { ListenerMessagesType } from '../Types/messages';
import { Client } from './client';
import { store } from '../Modules/store';
import { cleanJid, logColor } from '../Utils';

export class Logs {
  private ready = false;

  private timestamp = logColor(`[${new Date().toTimeString().split(' ')[0]}]`, '#383838ff');

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

    const color = this.getRoomColor(message);

    const sender = logColor(`${message?.roomName}`, color);
    const text = message.text?.slice(0, 300);

    let output = `${this.timestamp} → ${sender}\n`;

    if (message.isNewsletter) {
      output += `${logColor(`[room]`, '#383838ff')} → ${logColor(`${message?.roomName} (${cleanJid(message?.roomId)})`, color)}\n`;
    } else {
      output += `${logColor(`[sender]`, '#383838ff')} → ${logColor(`${message?.senderName} (${cleanJid(message?.senderId)})`, color)}\n`;
    }

    output += `${logColor(`[${message.chatType}]`, '#383838ff')} → ${logColor(text, 'brown')}\n`;
    output += `—`;

    console.log(output);
  }
}
