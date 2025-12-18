import { store } from '../Modules/store';
import { CallsContext } from '../Types/calls';
import { MessagesContext } from '../Types/messages';
import { cleanJid, ignoreLint, logColor } from '../Utils';
import { Client } from './client';

export class Logs {
  private logsInitialized = false;
  private logsDisplayed = false;
  private isReady = false;

  constructor(private client: Client) {
    this.initialize();
  }

  getRoomColor(validator) {
    if (validator?.isNewsletter) return 'blue';
    if (!validator?.isGroup) return 'orange';
    if (validator?.isGroup) return 'lime';

    return 'dimgray';
  }

  initialize() {
    if (!this.client.options.showLogs) return;
    if (this.logsInitialized) return;

    this.logsInitialized = true;

    const connectionListener = async ({ status }) => {
      if (status === 'open') {
        this.isReady = true;
        
        if (!this.logsDisplayed) {
          setTimeout(() => {
            this.displayIndicator();
          }, 500);
        }
      }
    };

    store.events.on('connection', connectionListener);
  }

  private displayIndicator() {
    if (this.logsDisplayed) return;
    this.logsDisplayed = true;

    console.log();
    store.spinner.info('Logs Indicator:');

    console.log(logColor('  •', 'orange') + ' Private Chat');
    console.log(logColor('  •', 'lime') + ' Group Chat');
    console.log(logColor('  •', 'blue') + ' Newsletter Chat');

    console.log();
  }

  message(message: Partial<MessagesContext>) {
    if (!this.isReady) return;

    const color = ignoreLint(this.getRoomColor(message));
    const isMatch = message?.text?.toLowerCase()?.match('zaileys');

    const timestamp = logColor(`[${new Date(message?.timestamp).toTimeString().split(' ')[0]}]`, 'dimgray');
    const sender = logColor(`${message?.roomName}`, color);

    const text = message?.text?.slice(0, 300) || '';
    const dots = text?.length >= 300 ? '...' : '';

    let output = `${timestamp} → ${sender}\n`;

    if (message?.isNewsletter) {
      output += `${logColor(`[room]`, 'dimgray')} → ${logColor(`${message?.roomName} (${cleanJid(message?.roomId)})`, color)}\n`;
    } else {
      output += `${logColor(`[sender]`, 'dimgray')} → ${logColor(`${message?.senderName} (${cleanJid(message?.senderId)})`, color)}\n`;
    }

    output += `${logColor(`[${message?.chatType || 'unknown'}]`, 'dimgray')} → ${logColor(text + dots, isMatch ? ['#ff5f6d', '#ffc371'] : 'brown')}\n`;
    output += `—`;

    console.log(output);
  }

  call(call: Partial<CallsContext>) {
    if (!store.get('logs')?.ready) return;

    const color = ignoreLint(this.getRoomColor(call));

    const timestamp = logColor(`[${new Date(call?.date).toTimeString().split(' ')[0]}]`, 'dimgray');
    const sender = logColor(`${call?.roomName}`, color);

    let output = `${timestamp} → ${sender}\n`;
    output += `${logColor(`[caller]`, 'dimgray')} → ${logColor(`${call?.callerName} (${cleanJid(call?.callerId)})`, color)}\n`;

    output += `${logColor(`[${call?.status}]`, 'dimgray')} → ${logColor(call?.isVideo ? 'Video Call' : 'Voice Call', 'brown')}\n`;
    output += `—`;

    console.log(output);
  }
}
