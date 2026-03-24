import { store, centerStore } from '../Store';
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

    const time = new Date(message?.timestamp || Date.now()).toTimeString().split(' ')[0];
    const timestamp = logColor(`[${time}]`, 'dimgray');
    const chatType = message?.chatType || 'text';
    
    const rawText = message?.text || '';
    const cleanText = rawText.replace(/\\n/g, ' ').slice(0, 150);
    const textOutput = rawText.length > 150 ? cleanText + '...' : cleanText;
    const isHighlight = isMatch ? ['#ff5f6d', '#ffc371'] : 'white';
    const textColor = isMatch ? isHighlight : 'gray';
    const content = logColor(textOutput || `<${chatType}>`, textColor);

    if (isFancy) {
      let header = '';
      const tags = [];
      
      if (message?.isNewsletter) {
        header = `${logColor('📢 NEWS', 'blue')} ${logColor(message?.roomName, color)}`;
        tags.push(`${logColor('ID:', 'dimgray')} ${cleanJid(message?.roomId)}`);
      } else if (message?.isGroup) {
        header = `${logColor('👥 GROUP', 'lime')} ${logColor(message?.roomName, color)}`;
        tags.push(`${logColor('By:', 'dimgray')} ${message?.senderName}`);
      } else {
        header = `${logColor('👤 PRIVATE', 'orange')} ${logColor(message?.senderName || 'Unknown', color)}`;
      }

      if (message?.isSpam) tags.push(logColor('⚠️ Spam', 'red'));
      if (message?.isForwarded) tags.push(logColor('↪️ Forwarded', 'yellow'));
      if (message?.isEdited) tags.push(logColor('✏️ Edited', 'yellow'));

      const tagString = tags.length ? ` ${logColor('•', 'dimgray')} ${tags.join(` ${logColor('|', 'dimgray')} `)}` : '';
      
      console.log(`\\n${timestamp} ${header}${tagString}`);
      console.log(`  ${logColor('↪', 'dimgray')} ${content}`);
    } else {
      let prefix = '';
      if (message?.isNewsletter) prefix = `[NEWS: ${message?.roomName}]`;
      else if (message?.isGroup) prefix = `[GRP: ${message?.roomName} | ${message?.senderName}]`;
      else prefix = `[PRIV: ${message?.senderName}]`;

      console.log(`${timestamp} ${logColor(prefix, color)} ${content}`);
    }
  }

  call(call: Partial<CallsContext>) {
    if (!this.isReady) return;

    const color = ignoreLint(this.getRoomColor(call));
    const time = new Date(call?.date || Date.now()).toTimeString().split(' ')[0];
    const timestamp = logColor(`[${time}]`, 'dimgray');
    const isVideo = call?.isVideo;
    const callerId = cleanJid(call?.callerId || '');

    if (this.client.options?.fancyLogs) {
      console.log(`\\n${timestamp} ${logColor(`📞 INCOMING ${isVideo ? 'VIDEO' : 'VOICE'} CALL`, color)}`);
      console.log(`  ${logColor('↪', 'dimgray')} ${logColor('From:', 'dimgray')} ${callerId} ${logColor('•', 'dimgray')} ${logColor('Status:', 'dimgray')} ${call?.status}`);
    } else {
      console.log(`${timestamp} ${logColor(`[CALL: ${callerId}]`, color)} ${isVideo ? 'Video' : 'Voice'} - ${call?.status}`);
    }
  }
}
