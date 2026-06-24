import webp from 'node-webpmux';
import { BufferConverter, FFMPEG_CONSTANTS, MimeValidator, detectFileType, generateId, type MediaInput } from './core.js';
import { ffmpegTransform } from './transform.js';
import { ImageProcessor } from './image.js';
import { VideoProcessor } from './video.js';
import { isLottieWas, LottieProcessor } from './lottie.js';

export type StickerShapeType = 'circle' | 'rounded' | 'oval' | 'default';

export interface StickerMetadataType {
  packageName?: string;
  authorName?: string;
  quality?: number;
  shape?: StickerShapeType;
}

type FileExtension = 'gif' | 'mp4' | 'tmp';

export class StickerProcessor {
  static async create(input: MediaInput, metadata?: StickerMetadataType): Promise<Buffer> {
    try {
      const buffer = await BufferConverter.toBuffer(input);
      const quality = metadata?.quality || FFMPEG_CONSTANTS.STICKER.DEFAULT_QUALITY;
      const shape = metadata?.shape || 'default';

      if (isLottieWas(buffer)) {
        const webpBuffer = await LottieProcessor.toWebp(buffer, quality);
        return await this.applyExif(webpBuffer, metadata);
      }

      const fileType = await detectFileType(buffer);

      if (!fileType) throw new Error('Unable to detect file type');

      const isAnimated = MimeValidator.isAnimated(fileType.mime);

      const webpBuffer = fileType.mime === 'image/webp'
        ? buffer
        : isAnimated
          ? await this.processAnimated(buffer, fileType.mime, quality)
          : await ImageProcessor.resizeForSticker(buffer, quality, shape);

      return await this.applyExif(webpBuffer, metadata);
    } catch (error: unknown) {
      throw new Error(`Sticker creation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private static async applyExif(webpBuffer: Buffer, metadata?: StickerMetadataType): Promise<Buffer> {
    const exif = this.createExifMetadata(metadata);
    const img = new webp.Image();
    await img.load(webpBuffer);
    img.exif = exif;
    const finalBuffer = await img.save(null);
    return Buffer.isBuffer(finalBuffer) ? finalBuffer : Buffer.from(finalBuffer as Uint8Array);
  }

  private static createExifMetadata(metadata?: StickerMetadataType): Buffer {
    const json = {
      'sticker-pack-id': generateId(),
      'sticker-pack-name': metadata?.packageName || 'Zaileys Library',
      'sticker-pack-publisher': metadata?.authorName || 'https://github.com/zeative/zaileys',
      emojis: ['\u{1F913}'],
      'android-app-store-link': 'https://play.google.com/store/apps/details?id=com.marsvard.stickermakerforwhatsapp',
      'ios-app-store-link': 'https://itunes.apple.com/app/sticker-maker-studio/id1443326857',
    };

    const exifAttr = Buffer.from([
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
    ]);

    const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
    const exif = Buffer.concat([exifAttr, jsonBuffer]);
    exif.writeUIntLE(jsonBuffer.length, 14, 4);

    return exif;
  }

  private static async processAnimated(buffer: Buffer, mime: string, quality: number): Promise<Buffer> {
    const size = FFMPEG_CONSTANTS.STICKER.SIZE;
    const fps = FFMPEG_CONSTANTS.STICKER.FPS;
    const videoFilter = `scale=${size}:${size}:force_original_aspect_ratio=decrease,fps=${fps},pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=rgba`;
    const qualityValue = Math.max(1, Math.min(100, quality));

    return ffmpegTransform(buffer, this.getExtension(mime), 'webp', 'Animated sticker processing', async (tempIn) => {
      let duration: number = FFMPEG_CONSTANTS.STICKER.MAX_DURATION;
      try {
        duration = Math.min(await VideoProcessor.duration(tempIn), FFMPEG_CONSTANTS.STICKER.MAX_DURATION);
      } catch {
        console.warn('Using default duration:', FFMPEG_CONSTANTS.STICKER.MAX_DURATION);
      }
      return [
        '-vcodec libwebp',
        `-vf ${videoFilter}`,
        `-q:v ${qualityValue}`,
        '-loop 0',
        '-preset default',
        '-an',
        '-vsync 0',
        `-t ${duration}`,
        `-compression_level ${FFMPEG_CONSTANTS.STICKER.COMPRESSION_LEVEL}`,
      ];
    });
  }

  private static getExtension(mime: string): FileExtension {
    if (mime === FFMPEG_CONSTANTS.MIME.GIF) return 'gif';
    if (mime.startsWith(FFMPEG_CONSTANTS.MIME.VIDEO)) return 'mp4';
    return 'tmp';
  }
}
