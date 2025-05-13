import { randomBytes, randomUUID } from "crypto";
import { curve as Curve } from "libsignal";
import { AppDataSync, Fingerprint, KeyPair, valueReplacer, valueReviver } from "../types/adapter/general";

const curve = Curve as any;

const generateKeyPair = () => {
  const { pubKey, privKey } = curve.generateKeyPair();
  return {
    private: Buffer.from(privKey),
    public: Buffer.from(pubKey.slice(1)),
  };
};

const generateSignalPubKey = (pubKey: Uint8Array) => {
  return pubKey.length === 33 ? pubKey : Buffer.concat([Buffer.from([5]), pubKey]);
};

const sign = (privateKey: object, buf: Uint8Array) => {
  return curve.calculateSignature(privateKey, buf);
};

const signedKeyPair = (identityKeyPair: KeyPair, keyId: number) => {
  const preKey = generateKeyPair();
  const pubKey = generateSignalPubKey(preKey.public);
  const signature = sign(identityKeyPair.private, pubKey);
  return { keyPair: preKey, signature, keyId };
};

const allocate = (str: string) => {
  let p = str.length;

  if (!p) {
    return new Uint8Array(1);
  }

  let n = 0;

  while (--p % 4 > 1 && str.charAt(p) === "=") {
    ++n;
  }

  return new Uint8Array(Math.ceil(str.length * 3) / 4 - n).fill(0);
};

const parseTimestamp = (timestamp: string | number | Long) => {
  if (typeof timestamp === "string") {
    return parseInt(timestamp, 10);
  }

  if (typeof timestamp === "number") {
    return timestamp;
  }

  return timestamp;
};

export const fromObject = (args: AppDataSync) => {
  const f: Fingerprint = {
    ...args.fingerprint,
    deviceIndexes: Array.isArray(args.fingerprint.deviceIndexes) ? args.fingerprint.deviceIndexes : [],
  };

  const message = {
    keyData: Array.isArray(args.keyData) ? args.keyData : new Uint8Array(),
    fingerprint: {
      rawId: f.rawId || 0,
      currentIndex: f.rawId || 0,
      deviceIndexes: f.deviceIndexes,
    },
    timestamp: parseTimestamp(args.timestamp),
  };

  if (typeof args.keyData === "string") {
    message.keyData = allocate(args.keyData);
  }

  return message;
};

export const BufferJSON = {
  replacer: (_: string, value: valueReplacer) => {
    if (value?.type === "Buffer" && Array.isArray(value?.data)) {
      return {
        type: "Buffer",
        data: Buffer.from(value?.data).toString("base64"),
      };
    }
    return value;
  },
  reviver: (_: string, value: valueReviver) => {
    if (value?.type === "Buffer") {
      return Buffer.from(value?.data, "base64");
    }
    return value;
  },
};

export const initAuthCreds = () => {
  const identityKey = generateKeyPair();
  return {
    noiseKey: generateKeyPair(),
    pairingEphemeralKeyPair: generateKeyPair(),
    signedIdentityKey: identityKey,
    signedPreKey: signedKeyPair(identityKey, 1),
    registrationId: Uint16Array.from(randomBytes(2))[0] & 16383,
    advSecretKey: randomBytes(32).toString("base64"),
    processedHistoryMessages: [],
    nextPreKeyId: 1,
    firstUnuploadedPreKeyId: 1,
    accountSyncCounter: 0,
    accountSettings: {
      unarchiveChats: false,
    },
    deviceId: Buffer.from(randomUUID().replace(/-/g, ""), "hex").toString("base64url"),
    phoneId: randomUUID(),
    identityId: randomBytes(20),
    backupToken: randomBytes(20),
    registered: false,
    registration: {} as never,
    pairingCode: undefined,
    lastPropHash: undefined,
    routingInfo: undefined,
  };
};
