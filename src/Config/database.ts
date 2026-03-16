import { open } from 'lmdb';

export const CredsDatabase = (session: string) =>
  open({
    path: `${session}/auth/creds`,
    compression: false,
  });

export const KeysDatabase = (session: string) =>
  open({
    path: `${session}/auth/keys`,
    compression: false,
  });

export const WaDatabase = (session: string, scope: string) =>
  open({
    path: `.session/${session}/store/${scope}`,
    compression: true,
  });
