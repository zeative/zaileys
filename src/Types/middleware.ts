import { CallsContext } from './calls';
import { MessagesContext } from './messages';

export type MiddlewareContextType = {
  messages?: Partial<MessagesContext>;
  calls?: Partial<CallsContext>;
};
