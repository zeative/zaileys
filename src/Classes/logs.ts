import z from 'zod';
import { ListenerMessagesType } from '../Types/messages';
import { Client } from './client';
import { store } from '../Modules/store';
import { cleanJid, logColor } from '../Utils';

export class Logs {
  private ready = false;

  private timestamp = `[${new Date().toTimeString().split(' ')[0]}]`;

  constructor(private client: Client) {
    this.initialize();
  }

  getRoomColor(validator) {
    if (!validator?.isGroup) return 'cyan';
    if (validator?.isGroup) return 'yellow';
    if (validator?.isNewsletter) return 'lime';

    return 'gray';
  }

  initialize() {
    if (!this.client.options.showLogs) return;

    store.events.on('connection', (data) => {
      if (data?.status === 'open') this.ready = true;

      if (this.ready) {
        console.log();
        store.spinner.info('Logs Indicator:');

        console.log(logColor('  •', 'cyan') + ' Private Chat');
        console.log(logColor('  •', 'yellow') + ' Group Chat');
        console.log(logColor('  •', 'lime') + ' Newsletter Chat');

        console.log();
      }
    });
  }

  message(message: Partial<z.infer<typeof ListenerMessagesType>>) {
    if (!this.ready) return;

    const sender = logColor(`[${message?.roomName}] ${message?.senderName} (${cleanJid(message?.senderId)})`, this.getRoomColor(message));

    let text = `${this.timestamp} ${sender}\n`;
    text += `${logColor(`(${message.chatType})`, '#383838ff')} ${logColor(message.text?.slice(0, 300), 'brown')}\n`;
    text += `—`;

    console.log(text);
  }
}
