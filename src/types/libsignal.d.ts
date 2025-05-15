declare module "libsignal" {
  export const initialize: () => Promise<void>;
  export const curve: {
    generateKeyPair: () => Promise<any>;
    createKeyPair: (pubKey: Buffer) => Promise<any>;
    calculateAgreement: (pubKey: Buffer, privKey: Buffer) => Promise<Buffer>;
    verifySignature: (pubKey: Buffer, message: Buffer, signature: Buffer) => Promise<boolean>;
  };
  export const encrypt: (data: Buffer, key: Buffer) => Promise<Buffer>;
  export const decrypt: (data: Buffer, key: Buffer) => Promise<Buffer>;
}
