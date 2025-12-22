import { fileTypeFromBuffer } from 'file-type';
import webp from 'node-webpmux';
import z from 'zod';
import { StickerMetadataType } from '../../Types';
import { generateId } from '../../Utils/message';
import { ignoreLint } from '../../Utils/validate';
import { BufferConverter, FFMPEG_CONSTANTS, FFmpegProcessor, FileManager, MimeValidator, type MediaInput } from './core';
import { ImageProcessor } from './image';
import { VideoProcessor } from './video';

type FileExtension = 'gif' | 'mp4' | 'tmp';

export class StickerProcessor {
  static async create(input: MediaInput, metadata?: z.infer<typeof StickerMetadataType>): Promise<Buffer> {
    try {
      const buffer = await BufferConverter.toBuffer(input);
      const fileType = await fileTypeFromBuffer(buffer);

      if (!fileType) throw new Error('Unable to detect file type');

      const quality = metadata?.quality || FFMPEG_CONSTANTS.STICKER.DEFAULT_QUALITY;
      const isAnimated = MimeValidator.isAnimated(fileType.mime);
      const shape = metadata?.shape || 'default';

      const webpBuffer = isAnimated
        ? await this.processAnimated(buffer, fileType.mime, quality)
        : await ImageProcessor.resizeForSticker(buffer, quality, shape);

      const exif = this.createExifMetadata(metadata);
      const img = new webp.Image();
      await img.load(webpBuffer);
      img.exif = exif;

      const finalBuffer = await img.save(null);
      return Buffer.isBuffer(finalBuffer) ? finalBuffer : Buffer.from(finalBuffer as any);
    } catch (error: any) {
      throw new Error(`Sticker creation failed: ${error.message || error}`);
    }
  }

  private static createExifMetadata(metadata?: z.infer<typeof StickerMetadataType>): Buffer {
    const json = {
      'sticker-pack-id': generateId(Date.now().toString()),
      'sticker-pack-name': metadata?.packageName || 'Zaileys Library',
      'sticker-pack-publisher': metadata?.authorName || 'https://github.com/zeative/zaileys',
      emojis: ['🤓'],
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
    const ext = this.getExtension(mime);
    const tempIn = FileManager.createTempPath('sticker_in', ext);
    const tempOut = FileManager.createTempPath('sticker_out', 'webp');

    await FileManager.safeWriteFile(tempIn, buffer);

    let duration = FFMPEG_CONSTANTS.STICKER.MAX_DURATION;
    try {
      const videoDuration = await VideoProcessor.duration(tempIn);
      duration = ignoreLint(Math.min(videoDuration, FFMPEG_CONSTANTS.STICKER.MAX_DURATION));
    } catch {
      console.warn('Using default duration:', FFMPEG_CONSTANTS.STICKER.MAX_DURATION);
    }

    const size = FFMPEG_CONSTANTS.STICKER.SIZE;
    const fps = FFMPEG_CONSTANTS.STICKER.FPS;
    const videoFilter = `scale=${size}:${size}:force_original_aspect_ratio=increase,crop=${size}:${size},fps=${fps},format=rgba`;
    const qualityValue = Math.max(1, Math.min(100, 100 - quality));

    let webpBuffer: Buffer;

    try {
      await FFmpegProcessor.process({
        input: tempIn,
        output: tempOut,
        options: [
          '-vcodec libwebp',
          `-vf ${videoFilter}`,
          `-q:v ${qualityValue}`,
          '-loop 0',
          '-preset default',
          '-an',
          '-vsync 0',
          `-t ${duration}`,
          `-compression_level ${FFMPEG_CONSTANTS.STICKER.COMPRESSION_LEVEL}`,
        ],
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
      throw new Error(`Animated sticker processing failed: ${error.message}`);
    }
  }

  private static getExtension(mime: string): FileExtension {
    if (mime === FFMPEG_CONSTANTS.MIME.GIF) return 'gif';
    if (mime.startsWith(FFMPEG_CONSTANTS.MIME.VIDEO)) return 'mp4';
    return 'tmp';
  }
}
