import { Jimp } from 'jimp';
import { BufferConverter, FFMPEG_CONSTANTS, getMediaLimits, type MediaInput } from './core.js';
import { ffmpegTransform } from './transform.js';

interface SharpInstance {
  resize(width: number, height: number, options?: Record<string, unknown>): SharpInstance;
  jpeg(options?: Record<string, unknown>): SharpInstance;
  png(options?: Record<string, unknown>): SharpInstance;
  webp(options?: Record<string, unknown>): SharpInstance;
  joinChannel(channel: Buffer): SharpInstance;
  metadata(): Promise<{ format?: string; width?: number; height?: number }>;
  toBuffer(): Promise<Buffer>;
}

type SharpLike = (input: Buffer, options?: Record<string, unknown>) => SharpInstance;

let _sharp: SharpLike | null = null;
let _sharpChecked = false;

async function getSharp(): Promise<SharpLike | null> {
  if (_sharpChecked) return _sharp;
  _sharpChecked = true;
  const accept = (candidate: unknown): void => {
    if (typeof candidate === 'function') _sharp = candidate as SharpLike;
  };
  try {
    accept(require('sharp'));
  } catch {
    _sharp = null;
  }
  if (!_sharp) {
    try {
      const mod = (await import('sharp')) as { default?: unknown };
      accept(mod.default ?? mod);
    } catch {
      _sharp = null;
    }
  }
  return _sharp;
}

function buildShapeMask(size: number, shape: string): Uint8Array {
  const mask = new Uint8Array(size * size);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 10;
  const corners = [
    [radius, radius],
    [size - radius, radius],
    [radius, size - radius],
    [size - radius, size - radius],
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let isInShape = false;
      if (shape === 'circle') {
        const dx = x - cx;
        const dy = y - cy;
        isInShape = dx * dx + dy * dy <= cx * cx;
      } else if (shape === 'rounded') {
        const inMainRect = x >= radius && x < size - radius && y >= 0 && y < size;
        const inVertRect = x >= 0 && x < size && y >= radius && y < size - radius;
        let inCorner = false;
        for (const corner of corners) {
          const dx = x - corner[0]!;
          const dy = y - corner[1]!;
          if (dx * dx + dy * dy <= radius * radius) {
            inCorner = true;
            break;
          }
        }
        isInShape = inMainRect || inVertRect || inCorner;
      } else if (shape === 'oval') {
        const dx = (x - cx) / (size / 2);
        const dy = (y - cy) / (size / 3);
        isInShape = dx * dx + dy * dy <= 1;
      }
      mask[y * size + x] = isInShape ? 255 : 0;
    }
  }
  return mask;
}

/**
 * Guards against decompression bombs: a 42-byte PNG can declare 65535x65535 and make the decoder
 * allocate ~17 GB, killing the process. One inbound message is enough, and the offline queue
 * redelivers it on every restart.
 */
const MAX_IMAGE_DIMENSION = 20_000

const assertSaneDimensions = (width: unknown, height: unknown): void => {
  const w = typeof width === 'number' && Number.isFinite(width) ? width : 0
  const h = typeof height === 'number' && Number.isFinite(height) ? height : 0
  if (w <= 0 || h <= 0) return
  if (w > MAX_IMAGE_DIMENSION || h > MAX_IMAGE_DIMENSION || w * h > getMediaLimits().maxImagePixels) {
    throw new Error(`Image too large to decode safely: ${w}x${h}`)
  }
}

const assertSaneTarget = (width: number, height: number): void => {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid resize target: ${width}x${height}`)
  }
  assertSaneDimensions(width, height)
}

/**
 * Reads the declared dimensions straight from the container header. Jimp allocates
 * width*height*4 bytes the moment it decodes, so the check has to happen before that call.
 * Returns undefined for formats we cannot cheaply parse; those fall through to the decoder.
 */
const headerDimensions = (buffer: Buffer): { width: number; height: number } | undefined => {
  if (buffer.length >= 24 && buffer.readUInt32BE(0) === 0x89504e47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  }
  if (buffer.length >= 10 && buffer.toString('ascii', 0, 3) === 'GIF') {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) }
  }
  if (buffer.length >= 26 && buffer.toString('ascii', 0, 2) === 'BM') {
    return { width: buffer.readInt32LE(18), height: Math.abs(buffer.readInt32LE(22)) }
  }
  if (buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buffer.toString('ascii', 12, 16)
    if (chunk === 'VP8X') {
      return {
        width: 1 + (buffer.readUIntLE(24, 3) & 0xffffff),
        height: 1 + (buffer.readUIntLE(27, 3) & 0xffffff),
      }
    }
    if (chunk === 'VP8 ' && buffer.length >= 30) {
      return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff }
    }
  }
  return undefined
}

const assertDecodable = (buffer: Buffer): Buffer => {
  const dims = headerDimensions(buffer)
  if (dims !== undefined) assertSaneDimensions(dims.width, dims.height)
  return buffer
}

class SharpImageProcessor {
  private sharp: SharpLike;

  constructor(sharpModule: SharpLike) {
    this.sharp = sharpModule;
  }

  async thumbnail(buffer: Buffer): Promise<string> {
    const sharp = this.sharp;
    assertDecodable(buffer);
    let sharpImg = sharp(buffer).resize(FFMPEG_CONSTANTS.THUMBNAIL.SIZE, FFMPEG_CONSTANTS.THUMBNAIL.SIZE, { fit: 'cover' });

    const metadata = await sharpImg.metadata();
    if (metadata.format === 'gif') {
      sharpImg = sharp(buffer, { pages: 1 }).resize(FFMPEG_CONSTANTS.THUMBNAIL.SIZE, FFMPEG_CONSTANTS.THUMBNAIL.SIZE);
    }

    const jpegBuffer = await sharpImg.jpeg({ quality: FFMPEG_CONSTANTS.THUMBNAIL.QUALITY }).toBuffer();
    return jpegBuffer.toString('base64');
  }

  async resize(buffer: Buffer, width: number, height: number): Promise<Buffer> {
    assertSaneTarget(width, height);
    const img = this.sharp(assertDecodable(buffer));
    const meta = await img.metadata();
    assertSaneDimensions(meta.width, meta.height);
    return img.resize(width, height, { fit: 'cover' }).png().toBuffer();
  }

  async toJpeg(input: MediaInput): Promise<Buffer> {
    const sharp = this.sharp;
    const buffer = assertDecodable(await BufferConverter.toBuffer(input));
    const metadata = await sharp(buffer).metadata();

    if (!metadata.format) {
      throw new Error('Invalid image type: format could not be determined');
    }

    if (metadata.format === 'webp' || metadata.format === 'png') {
      return sharp(buffer).jpeg().toBuffer();
    }

    return buffer;
  }

  async resizeForSticker(buffer: Buffer, quality: number, shape: string = 'default'): Promise<Buffer> {
    const sharp = this.sharp;
    const size = FFMPEG_CONSTANTS.STICKER.SIZE;
    let img = sharp(assertDecodable(buffer)).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });

    if (shape !== 'default') {
      const mask = Buffer.from(buildShapeMask(size, shape));
      const maskImg = sharp(mask, { raw: { width: size, height: size, channels: 1 } });
      img = img.joinChannel(await maskImg.png().toBuffer());
    }

    return img.webp({ quality }).toBuffer();
  }
}

class JimpImageProcessor {
  async thumbnail(buffer: Buffer): Promise<string> {
    const size = FFMPEG_CONSTANTS.THUMBNAIL.SIZE;
    const image = await Jimp.fromBuffer(assertDecodable(buffer));

    image.cover({ w: size, h: size });
    const jpegBuffer = await image.getBuffer('image/jpeg', { quality: FFMPEG_CONSTANTS.THUMBNAIL.QUALITY });
    return Buffer.from(jpegBuffer).toString('base64');
  }

  async resize(buffer: Buffer, width: number, height: number): Promise<Buffer> {
    assertSaneTarget(width, height);
    const image = await Jimp.fromBuffer(assertDecodable(buffer));
    image.cover({ w: width, h: height });
    const pngBuffer = await image.getBuffer('image/png');
    return Buffer.from(pngBuffer);
  }

  async toJpeg(input: MediaInput): Promise<Buffer> {
    const buffer = await BufferConverter.toBuffer(input);

    try {
      const image = await Jimp.fromBuffer(assertDecodable(buffer));
      const jpegBuffer = await image.getBuffer('image/jpeg');
      return Buffer.from(jpegBuffer);
    } catch {
      return buffer;
    }
  }

  async resizeForSticker(buffer: Buffer, quality: number, shape: string = 'default'): Promise<Buffer> {
    const size = FFMPEG_CONSTANTS.STICKER.SIZE;
    const image = await Jimp.fromBuffer(assertDecodable(buffer));

    image.contain({ w: size, h: size });

    if (shape !== 'default') {
      const mask = buildShapeMask(size, shape);
      const maskImage = new Jimp({ width: size, height: size, color: 0x000000ff });
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (mask[y * size + x] === 255) maskImage.setPixelColor(0xffffffff, x, y);
        }
      }
      image.mask(maskImage);
    }

    const pngBuffer = Buffer.from(await image.getBuffer('image/png'));
    const qualityValue = Math.max(1, Math.min(100, quality));
    return ffmpegTransform(pngBuffer, 'png', 'webp', 'Jimp WebP conversion', [
      '-vcodec', 'libwebp',
      '-q:v', `${qualityValue}`,
      '-preset', 'default',
    ]);
  }
}

let _processor: SharpImageProcessor | JimpImageProcessor | null = null;

async function getProcessor(): Promise<SharpImageProcessor | JimpImageProcessor> {
  if (_processor) return _processor;

  const sharpModule = await getSharp();
  if (sharpModule) {
    _processor = new SharpImageProcessor(sharpModule);
  } else {
    console.warn('\x1b[33m%s\x1b[0m', '[media-process] Jimp is slow. For faster performance, run: npm install sharp');
    _processor = new JimpImageProcessor();
  }

  return _processor;
}

export class ImageProcessor {
  static async thumbnail(buffer: Buffer): Promise<string> {
    return (await getProcessor()).thumbnail(buffer);
  }

  static async resize(buffer: Buffer, width: number, height: number): Promise<Buffer> {
    return (await getProcessor()).resize(buffer, width, height);
  }

  static async toJpeg(input: MediaInput): Promise<Buffer> {
    return (await getProcessor()).toJpeg(input);
  }

  static async resizeForSticker(buffer: Buffer, quality: number, shape: string = 'default'): Promise<Buffer> {
    return (await getProcessor()).resizeForSticker(buffer, quality, shape);
  }
}
