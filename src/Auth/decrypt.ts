import fs from "node:fs/promises";

export const allocate = (str: string) => {
  const len = str.length;
  if (!len) return new Uint8Array(1);
  const n = str.endsWith("==") ? 2 : str.endsWith("=") ? 1 : 0;
  return new Uint8Array(((len * 3) >> 2) - n);
};

export const parseTimestamp = (timestamp: string | number) => {
  return typeof timestamp === "number" ? timestamp : +timestamp;
};

export const fromObject = (args: Record<string, unknown>) => {
  const fp = (args.fingerprint as Record<string, unknown>) || {};
  const deviceIndexes = Array.isArray(fp.deviceIndexes) ? fp.deviceIndexes : [];
  const raw = Number(fp.rawId) || 0;
  const message = {
    keyData:
      typeof args.keyData === "string"
        ? allocate(args.keyData)
        : Array.isArray(args.keyData)
        ? args.keyData
        : new Uint8Array(),
    fingerprint: { rawId: raw, currentIndex: raw, deviceIndexes },
    timestamp: parseTimestamp(args.timestamp as string | number),
  };
  return message;
};

export const atomicWrite = async (path: string, data: Buffer) => {
  const tempPath = `${path}.tmp`;
  await fs.writeFile(tempPath, data);
  await fs.rename(tempPath, path);
};
