/** VP8X feature flags, most significant bit first: ICC, alpha, EXIF, XMP, animation. */
const FLAG_ALPHA = 0x10;
const FLAG_EXIF = 0x08;

interface WebpChunk {
  id: string;
  data: Buffer;
}

const fourcc = (buffer: Buffer, offset: number): string => buffer.toString('ascii', offset, offset + 4);

/** Walks the RIFF chunk list without copying; every length is checked against the declared file size. */
const readChunks = (webp: Buffer): WebpChunk[] => {
  if (webp.length < 12 || fourcc(webp, 0) !== 'RIFF' || fourcc(webp, 8) !== 'WEBP') {
    throw new Error('not a WebP file');
  }
  const end = Math.min(webp.length, 8 + webp.readUInt32LE(4));
  const chunks: WebpChunk[] = [];
  let offset = 12;
  while (offset + 8 <= end) {
    const id = fourcc(webp, offset);
    const size = webp.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > end) throw new Error(`truncated WebP ${id.trim()} chunk`);
    chunks.push({ id, data: webp.subarray(start, start + size) });
    offset = start + size + (size & 1);
  }
  return chunks;
};

/** Canvas size and alpha of a simple-format image, which VP8X has to restate. */
const canvasOf = (chunk: WebpChunk): { width: number; height: number; alpha: boolean } => {
  const data = chunk.data;
  if (chunk.id === 'VP8 ') {
    if (data.length < 10 || data[3] !== 0x9d || data[4] !== 0x01 || data[5] !== 0x2a) {
      throw new Error('invalid VP8 frame header');
    }
    return { width: data.readUInt16LE(6) & 0x3fff, height: data.readUInt16LE(8) & 0x3fff, alpha: false };
  }
  if (chunk.id === 'VP8L') {
    if (data.length < 5 || data[0] !== 0x2f) throw new Error('invalid VP8L header');
    const bits = data.readUInt32LE(1);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, alpha: ((bits >>> 28) & 1) === 1 };
  }
  throw new Error(`unsupported WebP image chunk ${chunk.id.trim()}`);
};

const encodeChunk = (id: string, data: Buffer): Buffer => {
  const header = Buffer.alloc(8);
  header.write(id, 0, 'ascii');
  header.writeUInt32LE(data.length, 4);
  return data.length % 2 === 0 ? Buffer.concat([header, data]) : Buffer.concat([header, data, Buffer.alloc(1)]);
};

/**
 * Sets the EXIF chunk WhatsApp reads sticker-pack metadata from. A simple VP8/VP8L file is promoted to the
 * extended VP8X layout, since the WebP container spec only allows EXIF there; any previous EXIF is replaced.
 */
export const setWebpExif = (webp: Buffer, exif: Buffer): Buffer => {
  const chunks = readChunks(webp).filter((chunk) => chunk.id !== 'EXIF');
  const first = chunks[0];
  if (first === undefined) throw new Error('WebP file has no image data');

  let vp8x: Buffer;
  let rest: WebpChunk[];
  if (first.id === 'VP8X') {
    if (first.data.length < 10) throw new Error('invalid VP8X header');
    vp8x = Buffer.from(first.data);
    vp8x[0] = (vp8x[0] ?? 0) | FLAG_EXIF;
    rest = chunks.slice(1);
  } else {
    const { width, height, alpha } = canvasOf(first);
    vp8x = Buffer.alloc(10);
    vp8x[0] = FLAG_EXIF | (alpha ? FLAG_ALPHA : 0);
    vp8x.writeUIntLE(width - 1, 4, 3);
    vp8x.writeUIntLE(height - 1, 7, 3);
    rest = chunks;
  }

  const body = Buffer.concat([
    encodeChunk('VP8X', vp8x),
    ...rest.map((chunk) => encodeChunk(chunk.id, chunk.data)),
    encodeChunk('EXIF', exif),
  ]);
  const riff = Buffer.alloc(12);
  riff.write('RIFF', 0, 'ascii');
  riff.writeUInt32LE(4 + body.length, 4);
  riff.write('WEBP', 8, 'ascii');
  return Buffer.concat([riff, body]);
};
