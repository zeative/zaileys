import { Jimp } from 'jimp';
import { BufferConverter, FFMPEG_CONSTANTS, type MediaInput } from './core.js';
import { ffmpegTransform } from './transform.js';

interface SharpInstance {
  resize(width: number, height: number, options?: Record<string, unknown>): SharpInstance;
  jpeg(options?: Record<string, unknown>): SharpInstance;
  png(options?: Record<string, unknown>): SharpInstance;
  webp(options?: Record<string, unknown>): SharpInstance;
  joinChannel(channel: Buffer): SharpInstance;
  metadata(): Promise<{ format?: string }>;
  toBuffer(): Promise<Buffer>;
}

type SharpLike = (input: Buffer, options?: Record<string, unknown>) => SharpInstance;

let _sharp: SharpLike | null = null;
let _sharpChecked = false;

function getSharp(): SharpLike | null {
  if (_sharpChecked) return _sharp;
  _sharpChecked = true;
  try {
    const s = require('sharp');
    if (typeof s === 'function') {
      _sharp = s as SharpLike;
    }
  } catch {
    _sharp = null;
  }
  return _sharp;
}

/**
 * Build a `size x size` single-channel alpha mask (0 or 255 per pixel) for a
 * sticker shape. Shared by the Sharp and Jimp sticker paths so the geometry has
 * one source of truth. An unknown shape yields an all-transparent mask.
 */
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

class SharpImageProcessor {
  private sharp: SharpLike;

  constructor(sharpModule: SharpLike) {
    this.sharp = sharpModule;
  }

  async thumbnail(buffer: Buffer): Promise<string> {
    const sharp = this.sharp;
    let sharpImg = sharp(buffer).resize(FFMPEG_CONSTANTS.THUMBNAIL.SIZE, FFMPEG_CONSTANTS.THUMBNAIL.SIZE, { fit: 'cover' });

    const metadata = await sharpImg.metadata();
    if (metadata.format === 'gif') {
      sharpImg = sharp(buffer, { pages: 1 }).resize(FFMPEG_CONSTANTS.THUMBNAIL.SIZE, FFMPEG_CONSTANTS.THUMBNAIL.SIZE);
    }

    const jpegBuffer = await sharpImg.jpeg({ quality: FFMPEG_CONSTANTS.THUMBNAIL.QUALITY }).toBuffer();
    return jpegBuffer.toString('base64');
  }

  async resize(buffer: Buffer, width: number, height: number): Promise<Buffer> {
    return this.sharp(buffer).resize(width, height, { fit: 'cover' }).png().toBuffer();
  }

  async toJpeg(input: MediaInput): Promise<Buffer> {
    const sharp = this.sharp;
    const buffer = await BufferConverter.toBuffer(input);
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
    let img = sharp(buffer).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });

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
    const image = await Jimp.fromBuffer(buffer);

    image.cover({ w: size, h: size });
    const jpegBuffer = await image.getBuffer('image/jpeg', { quality: FFMPEG_CONSTANTS.THUMBNAIL.QUALITY });
    return Buffer.from(jpegBuffer).toString('base64');
  }

  async resize(buffer: Buffer, width: number, height: number): Promise<Buffer> {
    const image = await Jimp.fromBuffer(buffer);
    image.cover({ w: width, h: height });
    const pngBuffer = await image.getBuffer('image/png');
    return Buffer.from(pngBuffer);
  }

  async toJpeg(input: MediaInput): Promise<Buffer> {
    const buffer = await BufferConverter.toBuffer(input);

    try {
      const image = await Jimp.fromBuffer(buffer);
      const jpegBuffer = await image.getBuffer('image/jpeg');
      return Buffer.from(jpegBuffer);
    } catch {
      return buffer;
    }
  }

  async resizeForSticker(buffer: Buffer, quality: number, shape: string = 'default'): Promise<Buffer> {
    const size = FFMPEG_CONSTANTS.STICKER.SIZE;
    const image = await Jimp.fromBuffer(buffer);

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

function getProcessor(): SharpImageProcessor | JimpImageProcessor {
  if (_processor) return _processor;

  const sharpModule = getSharp();
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
    return getProcessor().thumbnail(buffer);
  }

  static async resize(buffer: Buffer, width: number, height: number): Promise<Buffer> {
    return getProcessor().resize(buffer, width, height);
  }

  static async toJpeg(input: MediaInput): Promise<Buffer> {
    return getProcessor().toJpeg(input);
  }

  static async resizeForSticker(buffer: Buffer, quality: number, shape: string = 'default'): Promise<Buffer> {
    return getProcessor().resizeForSticker(buffer, quality, shape);
  }
}
