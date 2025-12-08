import z from 'zod';
import { store } from '../Modules/store';
import { ListenerMessagesType } from '../Types/messages';

type ParsedMessage = Partial<z.infer<typeof ListenerMessagesType>>;
type CollectorFilter = (msg: ParsedMessage) => boolean;
type CollectorCallback = (messages: ParsedMessage[]) => void;

interface CollectorOptions {
  filter?: CollectorFilter;
  timeout: number;
  max?: number;
}

const COLLECTOR_EVENT = '__collector__';

export class MessageCollector {
  collect(channelId: string, options: CollectorOptions, callback: CollectorCallback): void {
    const max = options.max ?? Infinity;

    if (max <= 0) {
      callback([]);
      return;
    }

    const messages: ParsedMessage[] = [];
    let timeoutId: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      clearTimeout(timeoutId);
      store.events.removeListener(COLLECTOR_EVENT, handler);
    };

    const handler = (msg: ParsedMessage) => {
      if (msg.channelId !== channelId) return;
      if (options.filter && !options.filter(msg)) return;

      messages.push(msg);

      if (messages.length >= max) {
        cleanup();
        callback(messages);
      }
    };

    store.events.on(COLLECTOR_EVENT, handler);

    timeoutId = setTimeout(() => {
      cleanup();
      callback(messages);
    }, options.timeout);
  }

  push(msg: ParsedMessage): boolean {
    const listeners = store.events.listenerCount(COLLECTOR_EVENT);
    if (listeners === 0) return false;

    store.events.emit(COLLECTOR_EVENT, msg);
    return true;
  }
}
