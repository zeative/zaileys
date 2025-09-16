import Long from "long";

export const allocate = (str: string) => {
  let n = 0;
  let p = str.length;

  if (!p) return new Uint8Array(1);
  while (--p % 4 > 1 && str.charAt(p) === "=") ++n;
  return new Uint8Array(Math.ceil(str.length * 3) / 4 - n).fill(0);
};

export const parseTimestamp = (timestamp: string | number | Long) => {
  if (typeof timestamp === "string") return parseInt(timestamp, 10);
  if (typeof timestamp === "number") return timestamp;
  return timestamp;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fromObject = (args: Record<string, any>) => {
  const fingerprint = args.fingerprint as Record<string, unknown> || {};
  const f = {
    ...fingerprint,
    deviceIndexes: Array.isArray(fingerprint.deviceIndexes) ? fingerprint.deviceIndexes : [],
  };

  const message = {
    keyData: Array.isArray(args.keyData) ? args.keyData : new Uint8Array(),
    fingerprint: {
      rawId: (fingerprint.rawId as number) || 0,
      currentIndex: (fingerprint.rawId as number) || 0,
      deviceIndexes: f.deviceIndexes,
    },
    timestamp: parseTimestamp(args.timestamp as string | number | Long),
  };

  if (typeof args.keyData === "string") {
    message.keyData = allocate(args.keyData);
  }

  return message;
};
