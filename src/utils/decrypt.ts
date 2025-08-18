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

export const fromObject = (args: any) => {
  const f = {
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
