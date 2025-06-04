declare module "libsignal" {
  export function init(): Promise<void>;
  export const curve: {
    generateKeyPair(): { pubKey: Uint8Array; privKey: Uint8Array };
    calculateSignature(privKey: Uint8Array, message: Uint8Array): Uint8Array;
    calculateAgreement(pubKey: Uint8Array, privKey: Uint8Array): Uint8Array;
    verifySignature(pubKey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean;
  };
  export function encrypt(data: Uint8Array, key: Uint8Array): Promise<Uint8Array>;
  export function decrypt(data: Uint8Array, key: Uint8Array): Promise<Uint8Array>;
}
