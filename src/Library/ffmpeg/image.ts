import { Jimp } from 'jimp';
import { fileTypeFromBuffer } from 'file-type';
import { BufferConverter, FFMPEG_CONSTANTS, FileManager, type MediaInput } from './core';

export class ImageProcessor {
  static async thumbnail(buffer: Buffer): Promise<string> {
    const fileType = await fileTypeFromBuffer(buffer);
    const size = FFMPEG_CONSTANTS.THUMBNAIL.SIZE;

    const image = await Jimp.read(buffer);
    image.cover({ w: size, h: size });

    if (fileType?.mime === FFMPEG_CONSTANTS.MIME.GIF) {
      image.resize({ w: size, h: size });
    }

    const jpegBuffer = await image.getBuffer('image/jpeg', { quality: FFMPEG_CONSTANTS.THUMBNAIL.QUALITY });
    return jpegBuffer.toString('base64');
  }

  static async resize(buffer: Buffer, width: number, height: number): Promise<Buffer> {
    const image = await Jimp.read(buffer);
    image.cover({ w: width, h: height });
    return await image.getBuffer('image/png');
  }

  static async toJpeg(input: MediaInput): Promise<Buffer> {
    const buffer = await BufferConverter.toBuffer(input);
    const fileType = await fileTypeFromBuffer(buffer);

    if (!fileType || !fileType.mime.startsWith(FFMPEG_CONSTANTS.MIME.IMAGE)) {
      throw new Error('Invalid image type');
    }

    if (fileType.mime === 'image/webp') {
      const image = await Jimp.read(buffer);
      return await image.getBuffer('image/jpeg');
    }

    return buffer;
  }

  static async resizeForSticker(buffer: Buffer, quality: number, shape: string = 'default'): Promise<Buffer> {
    const size = FFMPEG_CONSTANTS.STICKER.SIZE;
    const image = await Jimp.read(buffer);
    image.cover({ w: size, h: size });

    if (shape !== 'default') {
      const mask = new Jimp({ width: size, height: size, color: 0x00000000 });

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
            mask.setPixelColor(0xffffffff, x, y);
          }
        }
      }

      image.mask(mask);
    }

    const tempIn = FileManager.createTempPath('sticker_img', 'png');
    const tempOut = FileManager.createTempPath('sticker_out', 'webp');

    const pngBuffer = await image.getBuffer('image/png');
    await FileManager.safeWriteFile(tempIn, pngBuffer);

    const { FFmpegProcessor } = await import('./core');

    let webpBuffer: Buffer;

    try {
      await FFmpegProcessor.process({
        input: tempIn,
        output: tempOut,
        options: ['-vf', `scale=${size}:${size}`, '-quality', String(quality), '-f', 'webp'],
        onEnd: async () => {
          webpBuffer = await FileManager.safeReadFile(tempOut);
        },
        onError: async () => {
          await FileManager.cleanup([tempIn, tempOut]);
        },
      });

      await FileManager.cleanup([tempIn, tempOut]);
      return webpBuffer!;
    } catch (error: any) {
      await FileManager.cleanup([tempIn, tempOut]);
      throw new Error(`Sticker resize failed: ${error.message}`);
    }
  }
}
