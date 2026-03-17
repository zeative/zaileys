import sharp from 'sharp';
import { BufferConverter, FFMPEG_CONSTANTS, FileManager, type MediaInput } from './core';

export class ImageProcessor {
  static async thumbnail(buffer: Buffer): Promise<string> {
    let sharpImg = sharp(buffer).resize(FFMPEG_CONSTANTS.THUMBNAIL.SIZE, FFMPEG_CONSTANTS.THUMBNAIL.SIZE, { fit: 'cover' });
    
    // For GIFs, we still resize without cover to retain frame bounds properly (or pick first frame)
    const metadata = await sharpImg.metadata();
    if (metadata.format === 'gif') {
      sharpImg = sharp(buffer, { pages: 1 }).resize(FFMPEG_CONSTANTS.THUMBNAIL.SIZE, FFMPEG_CONSTANTS.THUMBNAIL.SIZE);
    }

    const jpegBuffer = await sharpImg.jpeg({ quality: FFMPEG_CONSTANTS.THUMBNAIL.QUALITY }).toBuffer();
    return jpegBuffer.toString('base64');
  }

  static async resize(buffer: Buffer, width: number, height: number): Promise<Buffer> {
    return sharp(buffer).resize(width, height, { fit: 'cover' }).png().toBuffer();
  }

  static async toJpeg(input: MediaInput): Promise<Buffer> {
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

  static async resizeForSticker(buffer: Buffer, quality: number, shape: string = 'default'): Promise<Buffer> {
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

      // Convert mask array to sharp image
      const maskImg = sharp(mask, { raw: { width: size, height: size, channels: 1 } });
      img = img.joinChannel(await maskImg.toBuffer());
    }

    // Force transparency & generate webp
    return img.webp({ quality }).toBuffer();
  }
}
