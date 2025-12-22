import { store } from '../Library/center-store';
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
    const isFancy = this.client.options?.fancyLogs;

    const timestamp = logColor(`[${new Date(message?.timestamp).toTimeString().split(' ')[0]}]`, 'dimgray');
    const sender = logColor(`${message?.roomName}`, color);

    const text = message?.text?.slice(0, 300) || '';
    const dots = text?.length >= 300 ? '...' : '';

    if (isFancy) {
      const divider = logColor('━'.repeat(50), 'dimgray');
      const arrow = logColor('→', 'dimgray');
      const bullet = logColor('•', color);

      let output = `\n${divider}\n`;
      output += `${bullet} ${timestamp} ${arrow} ${sender}\n`;

      if (message?.isNewsletter) {
        output += `  ${logColor('📢 Room:', 'dimgray')} ${logColor(`${message?.roomName}`, color)}\n`;
        output += `  ${logColor('🆔 ID:', 'dimgray')} ${logColor(`${cleanJid(message?.roomId)}`, 'gray')}\n`;
      } else {
        output += `  ${logColor('👤 Sender:', 'dimgray')} ${logColor(`${message?.senderName}`, color)}\n`;
        output += `  ${logColor('🆔 ID:', 'dimgray')} ${logColor(`${cleanJid(message?.senderId)}`, 'gray')}\n`;
        if (message?.isGroup) {
          output += `  ${logColor('🏠 Group:', 'dimgray')} ${logColor(`${message?.roomName}`, 'lime')}\n`;
        }
      }

      output += `  ${logColor('📝 Type:', 'dimgray')} ${logColor(`${message?.chatType || 'text'}`, 'cyan')}\n`;
      output += `  ${logColor('💬 Text:', 'dimgray')} ${logColor(text + dots, isMatch ? ['#ff5f6d', '#ffc371'] : 'brown')}\n`;

      if (message?.isSpam) output += `  ${logColor('⚠️ Spam:', 'dimgray')} ${logColor('Yes', 'red')}\n`;
      if (message?.isForwarded) output += `  ${logColor('↪️ Forwarded:', 'dimgray')} ${logColor('Yes', 'yellow')}\n`;
      if (message?.isEdited) output += `  ${logColor('✏️ Edited:', 'dimgray')} ${logColor('Yes', 'yellow')}\n`;

      output += `${divider}`;
      console.log(output);
    } else {
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
  }

  call(call: Partial<CallsContext>) {
    if (!this.isReady) return;

    const color = ignoreLint(this.getRoomColor(call));

    const timestamp = logColor(`[${new Date(call?.date).toTimeString().split(' ')[0]}]`, 'dimgray');
    const sender = logColor(`${call?.roomName}`, color);

    let output = `${timestamp} → ${sender}\n`;
    output += `${logColor(`[caller]`, 'dimgray')} → ${logColor(`${call?.callerId} (${cleanJid(call?.callerId)})`, color)}\n`;

    output += `${logColor(`[${call?.status}]`, 'dimgray')} → ${logColor(call?.isVideo ? 'Video Call' : 'Voice Call', 'brown')}\n`;
    output += `—`;

    console.log(output);
  }
}
