import { Jimp } from 'jimp';
import { BufferConverter, FFMPEG_CONSTANTS, FFmpegProcessor, FileManager, type MediaInput } from './core';

// ─── Dynamic Sharp loader ───────────────────────────────────────────────────
let _sharp: any | null = null;
let _sharpChecked = false;

function getSharp(): any | null {
  if (_sharpChecked) return _sharp;
  _sharpChecked = true;
  try {
    const s = require('sharp');
    // Sanity check: ensure it can at least be initialized
    // Some environments (like Termux) might allow require but fail on invocation
    if (typeof s === 'function') {
      _sharp = s;
    }
  } catch {
    _sharp = null;
  }
  return _sharp;
}

// ─── Sharp-based implementations ────────────────────────────────────────────
class SharpImageProcessor {
  private sharp: any;

  constructor(sharpModule: any) {
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
      const mask = Buffer.alloc(size * size);

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          let isInShape = false;
          const cx = size / 2;
          const cy = size / 2;

          switch (shape) {
            case 'circle': {
              const dx = x - cx;
              const dy = y - cy;
              isInShape = (dx * dx + dy * dy) <= (cx * cx);
              break;
            }
            case 'rounded': {
              const radius = size / 10;
              const inMainRect = x >= radius && x < size - radius && y >= 0 && y < size;
              const inVertRect = x >= 0 && x < size && y >= radius && y < size - radius;

              let inCorner = false;
              const corners = [
                [radius, radius],
                [size - radius, radius],
                [radius, size - radius],
                [size - radius, size - radius],
              ];

              for (const [ccx, ccy] of corners) {
                const dx = x - ccx;
                const dy = y - ccy;
                if (dx * dx + dy * dy <= radius * radius) {
                  inCorner = true;
                  break;
                }
              }

              isInShape = inMainRect || inVertRect || inCorner;
              break;
            }
            case 'oval': {
              const rx = size / 2;
              const ry = size / 3;
              const dx = (x - cx) / rx;
              const dy = (y - cy) / ry;
              isInShape = (dx * dx + dy * dy) <= 1;
              break;
            }
          }

          mask[y * size + x] = isInShape ? 255 : 0;
        }
      }

      const maskImg = sharp(mask, { raw: { width: size, height: size, channels: 1 } });
      img = img.joinChannel(await maskImg.png().toBuffer());
    }

    return img.webp({ quality }).toBuffer();
  }
}

// ─── Jimp-based implementations ─────────────────────────────────────────────
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

    // Resize to contain within sticker bounds
    image.contain({ w: size, h: size });

    if (shape !== 'default') {
      // Create mask image (white = visible, black = transparent)
      const maskImage = new Jimp({ width: size, height: size, color: 0x000000ff });

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          let isInShape = false;
          const cx = size / 2;
          const cy = size / 2;

          switch (shape) {
            case 'circle': {
              const dx = x - cx;
              const dy = y - cy;
              isInShape = (dx * dx + dy * dy) <= (cx * cx);
              break;
            }
            case 'rounded': {
              const radius = size / 10;
              const inMainRect = x >= radius && x < size - radius && y >= 0 && y < size;
              const inVertRect = x >= 0 && x < size && y >= radius && y < size - radius;

              let inCorner = false;
              const corners = [
                [radius, radius],
                [size - radius, radius],
                [radius, size - radius],
                [size - radius, size - radius],
              ];

              for (const [ccx, ccy] of corners) {
                const dx = x - ccx;
                const dy = y - ccy;
                if (dx * dx + dy * dy <= radius * radius) {
                  inCorner = true;
                  break;
                }
              }

              isInShape = inMainRect || inVertRect || inCorner;
              break;
            }
            case 'oval': {
              const rx = size / 2;
              const ry = size / 3;
              const dx = (x - cx) / rx;
              const dy = (y - cy) / ry;
              isInShape = (dx * dx + dy * dy) <= 1;
              break;
            }
          }

          if (isInShape) {
            maskImage.setPixelColor(0xffffffff, x, y);
          }
        }
      }

      image.mask(maskImage);
    }

    // Jimp can't write webp natively — use FFmpeg to convert PNG → WebP
    const pngBuffer = Buffer.from(await image.getBuffer('image/png'));
    return this.convertToWebp(pngBuffer, quality);
  }

  private async convertToWebp(pngBuffer: Buffer, quality: number): Promise<Buffer> {
    const tempIn = FileManager.createTempPath('sticker_jimp_in', 'png');
    const tempOut = FileManager.createTempPath('sticker_jimp_out', 'webp');

    await FileManager.safeWriteFile(tempIn, pngBuffer);

    const qualityValue = Math.max(1, Math.min(100, quality));

    try {
      await FFmpegProcessor.process({
        input: tempIn,
        output: tempOut,
        options: [
          '-vcodec', 'libwebp',
          `-q:v`, `${qualityValue}`,
          '-preset', 'default',
        ],
        onEnd: async () => {},
        onError: async () => {
          await FileManager.cleanup([tempIn, tempOut]);
        },
      });

      const webpBuffer = await FileManager.safeReadFile(tempOut);
      await FileManager.cleanup([tempIn, tempOut]);
      return webpBuffer;
    } catch (error: any) {
      await FileManager.cleanup([tempIn, tempOut]);
      throw new Error(`Jimp WebP conversion failed: ${error.message}`);
    }
  }
}

// ─── Public API (auto-selects backend) ──────────────────────────────────────
let _processor: SharpImageProcessor | JimpImageProcessor | null = null;

function getProcessor(): SharpImageProcessor | JimpImageProcessor {
  if (_processor) return _processor;

  const sharpModule = getSharp();
  if (sharpModule) {
    _processor = new SharpImageProcessor(sharpModule);
  } else {
    console.warn('\x1b[33m%s\x1b[0m', '⚠️ [media-process] Jimp is slow. For faster performance, run: npm install sharp');
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
