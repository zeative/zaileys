import { ListenerCallsType } from './calls';
import { ListenerMessagesType } from './messages';
import z from 'zod';

export type MiddlewareContextType = {
  messages?: Partial<z.infer<typeof ListenerMessagesType>>;
  calls?: Partial<z.infer<typeof ListenerCallsType>>;
};
