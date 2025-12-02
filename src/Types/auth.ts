import { AuthenticationState } from 'baileys';

export type AuthStateType = {
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
};
