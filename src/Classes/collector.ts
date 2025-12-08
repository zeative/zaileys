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

interface CollectorState {
  messages: ParsedMessage[];
  max: number;
  filter?: CollectorFilter;
  callback: CollectorCallback;
  timeoutId: ReturnType<typeof setTimeout>;
}

export class MessageCollector {
  collect(channelId: string, options: CollectorOptions, callback: CollectorCallback): void {
    const max = options.max ?? Infinity;

    if (max <= 0) {
      callback([]);
      return;
    }

    const existing = store.collectors.get(channelId) as CollectorState | undefined;
    if (existing) {
      clearTimeout(existing.timeoutId);
      existing.callback(existing.messages);
      store.collectors.delete(channelId);
    }

    const timeoutId = setTimeout(() => {
      const state = store.collectors.get(channelId) as CollectorState | undefined;
      if (state) {
        state.callback(state.messages);
        store.collectors.delete(channelId);
      }
    }, options.timeout);

    store.collectors.set(channelId, {
      messages: [],
      max,
      filter: options.filter,
      callback,
      timeoutId,
    });
  }

  push(msg: ParsedMessage): boolean {
    const state = store.collectors.get(msg.channelId) as CollectorState | undefined;
    if (!state) return false;

    if (state.filter && !state.filter(msg)) return false;

    state.messages.push(msg);

    if (state.messages.length >= state.max) {
      clearTimeout(state.timeoutId);
      state.callback(state.messages);
      store.collectors.delete(msg.channelId);
    }

    return true;
  }

  has(channelId: string): boolean {
    return store.collectors.has(channelId);
  }

  cancel(channelId: string): ParsedMessage[] {
    const state = store.collectors.get(channelId) as CollectorState | undefined;
    if (!state) return [];

    clearTimeout(state.timeoutId);
    state.callback(state.messages);
    store.collectors.delete(channelId);

    return state.messages;
  }
}
