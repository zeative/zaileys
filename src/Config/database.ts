import { BufferJSON } from 'baileys';
import { open } from 'lmdb';

const encoder = {
  encode: (obj: any) => JSON.stringify(obj, BufferJSON.replacer),
  decode: (str: string) => JSON.parse(str, BufferJSON.reviver),
};

export const CredsDatabase = (session: string) =>
  open({
    path: `${session}/auth/creds`,
    compression: false,
    encoder,
  });

export const KeysDatabase = (session: string) =>
  open({
    path: `${session}/auth/keys`,
    compression: false,
    encoder,
  });

export const WaDatabase = (session: string, scope: string) =>
  open({
    path: `.session/${session}/store/${scope}`,
    compression: true,
    encoder,
  });
