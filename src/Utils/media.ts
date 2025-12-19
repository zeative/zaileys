import { fileTypeFromBuffer } from 'file-type';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';
import _ from 'lodash';
import webp from 'node-webpmux';
import { tmpdir } from 'os';
import path from 'path';
import sharp from 'sharp';
import z from 'zod';
import { StickerMetadataType } from '../Types';
import { generateId } from './message';
import { ignoreLint } from './validate';

export const configureFFmpeg = async (disable: boolean = false) => {
  if (disable) return;

  try {
    const ffmpegInstaller = (await import('@ffmpeg-installer/ffmpeg')).default;
    const ffprobeInstaller = (await import('@ffprobe-installer/ffprobe')).default;

    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
    ffmpeg.setFfprobePath(ffprobeInstaller.path);
  } catch (e) {
    // Ignore errors if paths are already set or invalid
  }
};

const CONSTANTS = {
  OPUS: {
    CODEC: 'libopus',
    CHANNELS: 1,
    FREQUENCY: 48000,
    BITRATE: '48k',
    FORMAT: 'ogg',
  },
  THUMBNAIL: {
    SIZE: 100,
    QUALITY: 50,
    TIMESTAMP: '10%',
  },
  STICKER: {
    SIZE: 512,
    MAX_DURATION: 10,
    FPS: 15,
    DEFAULT_QUALITY: 80,
    COMPRESSION_LEVEL: 6,
  },
  MIME: {
    AUDIO: 'audio/',
    VIDEO: 'video/',
    IMAGE: 'image/',
    GIF: 'image/gif',
    MP4: 'video/mp4',
  },
} as const;

type MediaInput = string | ArrayBuffer | Buffer;
type FileExtension = 'wav' | 'ogg' | 'mp4' | 'gif' | 'jpg' | 'webp' | 'tmp' | 'mp3';

export type AudioType = 'opus' | 'mp3';

interface FFmpegConfig {
  input: string;
  output: string;
  options: string[];
  onEnd: () => Promise<void>;
  onError: (err: Error) => Promise<void>;
}

class FileManager {
  private static generateUniqueId(): string {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  static createTempPath(prefix: string, ext: FileExtension): string {
    return path.join(tmpdir(), `${prefix}_${this.generateUniqueId()}.${ext}`);
  }

  static async cleanup(files: string[]): Promise<void> {
    await Promise.allSettled(files.map((f) => fs.unlink(f)));
  }

  static async safeReadFile(filePath: string): Promise<Buffer> {
    try {
      return await fs.readFile(filePath);
    } catch (error) {
      throw new Error(`Failed to read file: ${filePath}`);
    }
  }

  static async safeWriteFile(filePath: string, data: Buffer): Promise<void> {
    try {
      await fs.writeFile(filePath, data);
    } catch (error) {
      throw new Error(`Failed to write file: ${filePath}`);
    }
  }
}

class BufferConverter {
  static async toBuffer(input: MediaInput): Promise<any> {
    if (_.isBuffer(input)) return input;
    if (_.isArrayBuffer(input)) return Buffer.from(input);
    if (_.isString(input)) return this.fromString(input);

    throw new Error('Invalid input type: expected string, Buffer, or ArrayBuffer');
  }

  private static async fromString(input: string): Promise<Buffer> {
    if (input.startsWith('http://') || input.startsWith('https://')) {
      return this.fromUrl(input);
    }
    return Buffer.from(input, 'base64');
  }

  private static async fromUrl(url: string): Promise<Buffer> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      throw new Error(`Failed to fetch URL: ${error.message}`);
    }
  }
}

class MimeValidator {
  static validate(fileType: any, expectedPrefix: string): void {
    if (!fileType?.mime?.startsWith(expectedPrefix)) {
      throw new Error(`Invalid file type: expected ${expectedPrefix}*, got ${fileType?.mime || 'unknown'}`);
    }
  }

  static isMedia(mime: string): boolean {
    return mime.startsWith(CONSTANTS.MIME.IMAGE) || mime.startsWith(CONSTANTS.MIME.VIDEO);
  }

  static isAnimated(mime: string): boolean {
    return mime === CONSTANTS.MIME.GIF || mime.startsWith(CONSTANTS.MIME.VIDEO);
  }
}

class FFmpegProcessor {
  static async process(config: FFmpegConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      const processor = ffmpeg(config.input).output(config.output);

      for (let i = 0; i < config.options.length; i++) {
        const option = config.options[i];

        if (option.startsWith('-') && i + 1 < config.options.length && !config.options[i + 1].startsWith('-')) {
          processor.outputOptions(option, config.options[i + 1]);
          i++;
        } else {
          processor.outputOptions(option);
        }
      }

      processor
        .on('end', async () => {
          try {
            await config.onEnd();
            resolve();
          } catch (error) {
            reject(error);
          }
        })
        .on('error', async (err) => {
          try {
            await config.onError(err);
          } finally {
            reject(err);
          }
        })
        .run();
    });
  }

  static async getDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) return reject(err);
        resolve(metadata.format.duration || 0);
      });
    });
  }
}

export class AudioProcessor {
  static async getWaAudio(input: MediaInput, type: AudioType = 'opus'): Promise<Buffer> {
    const buffer = await BufferConverter.toBuffer(input);
    const fileType = await fileTypeFromBuffer(buffer);

    MimeValidator.validate(fileType, CONSTANTS.MIME.AUDIO);

    const tempIn = FileManager.createTempPath('audio_in', 'wav');
    const extension = type === 'opus' ? 'ogg' : 'mp3';
    const tempOut = FileManager.createTempPath('audio_out', extension);

    await FileManager.safeWriteFile(tempIn, buffer);

    let outputBuffer: Buffer;

    try {
      const options =
        type === 'opus'
          ? ['-vn', '-c:a', 'libopus', '-b:a', '48k', '-ac', '1', '-avoid_negative_ts', 'make_zero', '-map_metadata', '-1', '-f', 'opus']
          : ['-vn', '-c:a', 'libmp3lame', '-b:a', '128k', '-ac', '2', '-avoid_negative_ts', 'make_zero', '-map_metadata', '-1', '-f', 'mp3'];

      await FFmpegProcessor.process({
        input: tempIn,
        output: tempOut,
        options,
        onEnd: async () => {
          outputBuffer = await FileManager.safeReadFile(tempOut);
        },
        onError: async () => {
          await FileManager.cleanup([tempIn, tempOut]);
        },
      });

      await FileManager.cleanup([tempIn, tempOut]);
      return outputBuffer!;
    } catch (error) {
      await FileManager.cleanup([tempIn, tempOut]);
      throw new Error(`${type.toUpperCase()} conversion failed: ${error.message}`);
    }
  }
}

export class VideoProcessor {
  static async getThumbnail(input: MediaInput): Promise<string> {
    const buffer = await BufferConverter.toBuffer(input);
    const fileType = await fileTypeFromBuffer(buffer);

    MimeValidator.validate(fileType, CONSTANTS.MIME.VIDEO);

    const tempIn = FileManager.createTempPath('video', 'mp4');
    const tempThumb = FileManager.createTempPath('thumb', 'jpg');

    await FileManager.safeWriteFile(tempIn, buffer);

    let thumbnailBase64: string;

    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(tempIn)
          .screenshots({
            timestamps: [CONSTANTS.THUMBNAIL.TIMESTAMP],
            filename: path.basename(tempThumb),
            folder: path.dirname(tempThumb),
            size: `${CONSTANTS.THUMBNAIL.SIZE}x${CONSTANTS.THUMBNAIL.SIZE}`,
            quality: CONSTANTS.THUMBNAIL.QUALITY,
          })
          .on('end', async () => {
            try {
              const thumbBuffer = await FileManager.safeReadFile(tempThumb);
              thumbnailBase64 = thumbBuffer.toString('base64');
              resolve();
            } catch (error) {
              reject(error);
            }
          })
          .on('error', reject);
      });

      await FileManager.cleanup([tempIn, tempThumb]);
      return thumbnailBase64!;
    } catch (error) {
      await FileManager.cleanup([tempIn, tempThumb]);
      throw new Error(`Thumbnail generation failed: ${error.message}`);
    }
  }

  static async getDuration(filePath: string): Promise<number> {
    return FFmpegProcessor.getDuration(filePath);
  }

  static async getWaVideo(input: MediaInput): Promise<Buffer> {
    const buffer = await BufferConverter.toBuffer(input);
    const fileType = await fileTypeFromBuffer(buffer);

    MimeValidator.validate(fileType, CONSTANTS.MIME.VIDEO);

    const tempIn = FileManager.createTempPath('video_in', 'mp4');
    const tempOut = FileManager.createTempPath('video_out', 'mp4');

    await FileManager.safeWriteFile(tempIn, buffer);

    let outputBuffer: Buffer;

    try {
      // Re-encode to highly compatible H.264/AAC MP4
      const options = [
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '28',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        '-pix_fmt',
        'yuv420p',
        '-f',
        'mp4',
      ];

      await FFmpegProcessor.process({
        input: tempIn,
        output: tempOut,
        options,
        onEnd: async () => {
          outputBuffer = await FileManager.safeReadFile(tempOut);
        },
        onError: async () => {
          await FileManager.cleanup([tempIn, tempOut]);
        },
      });

      await FileManager.cleanup([tempIn, tempOut]);
      return outputBuffer!;
    } catch (error) {
      await FileManager.cleanup([tempIn, tempOut]);
      throw new Error(`Video re-encoding failed: ${error.message}`);
    }
  }
}

export class ImageProcessor {
  static async getThumbnail(buffer: Buffer): Promise<string> {
    const mime = (await fileTypeFromBuffer(buffer)).mime;
    const sharpInstance = mime === CONSTANTS.MIME.GIF ? sharp(buffer, { animated: false }) : sharp(buffer);

    const thumbnail = await sharpInstance
      .resize(CONSTANTS.THUMBNAIL.SIZE, CONSTANTS.THUMBNAIL.SIZE, { fit: 'cover' })
      .jpeg({ quality: CONSTANTS.THUMBNAIL.QUALITY })
      .toBuffer();

    return thumbnail.toString('base64');
  }

  static async resizeForSticker(buffer: Buffer, quality: number, shape: string = 'default'): Promise<Buffer> {
    let sharpInstance = sharp(buffer).resize(CONSTANTS.STICKER.SIZE, CONSTANTS.STICKER.SIZE, {
      fit: 'cover',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });

    if (shape !== 'default') {
      const size = CONSTANTS.STICKER.SIZE;
      let mask: string;

      switch (shape) {
        case 'rounded':
          mask = `<svg width="${size}" height="${size}"><rect x="0" y="0" width="${size}" height="${size}" rx="${size / 10}" ry="${size / 10}" fill="white"/></svg>`;
          break;
        case 'circle':
          mask = `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`;
          break;
        case 'oval':
          mask = `<svg width="${size}" height="${size}"><ellipse cx="${size / 2}" cy="${size / 2}" rx="${size / 2}" ry="${size / 3}" fill="white"/></svg>`;
          break;
        default:
          mask = '';
      }

      if (mask) {
        sharpInstance = sharpInstance.composite([
          {
            input: Buffer.from(mask),
            blend: 'dest-in',
          },
        ]);
      }
    }

    return sharpInstance.webp({ quality }).toBuffer();
  }

  static async getWaImage(input: MediaInput): Promise<Buffer> {
    const buffer = await BufferConverter.toBuffer(input);
    const fileType = await fileTypeFromBuffer(buffer);

    if (!fileType || !fileType.mime.startsWith(CONSTANTS.MIME.IMAGE)) {
      throw new Error('Invalid image type');
    }

    if (fileType.mime === 'image/webp') {
      return await sharp(buffer).jpeg().toBuffer();
    }

    return buffer;
  }
}

export class MediaProcessor {
  static async getThumbnail(input: MediaInput): Promise<string> {
    const buffer = await BufferConverter.toBuffer(input);
    const fileType = await fileTypeFromBuffer(buffer);

    if (!fileType || !MimeValidator.isMedia(fileType.mime)) {
      throw new Error('Invalid media type: expected image or video');
    }

    if (fileType.mime.startsWith(CONSTANTS.MIME.VIDEO)) {
      return VideoProcessor.getThumbnail(input);
    }

    return ImageProcessor.getThumbnail(buffer);
  }
}

export class StickerProcessor {
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

    let duration = CONSTANTS.STICKER.MAX_DURATION;
    try {
      const videoDuration = await VideoProcessor.getDuration(tempIn);
      duration = ignoreLint(Math.min(videoDuration, CONSTANTS.STICKER.MAX_DURATION));
    } catch (error) {
      console.warn('Using default duration:', CONSTANTS.STICKER.MAX_DURATION);
    }

    const videoFilter = `scale=${CONSTANTS.STICKER.SIZE}:${CONSTANTS.STICKER.SIZE}:force_original_aspect_ratio=increase,crop=${CONSTANTS.STICKER.SIZE}:${CONSTANTS.STICKER.SIZE},fps=${CONSTANTS.STICKER.FPS},format=rgba`;
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
          `-compression_level ${CONSTANTS.STICKER.COMPRESSION_LEVEL}`,
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
    } catch (error) {
      await FileManager.cleanup([tempIn, tempOut]);
      throw new Error(`Animated sticker processing failed: ${error.message}`);
    }
  }

  private static getExtension(mime: string): FileExtension {
    if (mime === CONSTANTS.MIME.GIF) return 'gif';
    if (mime.startsWith(CONSTANTS.MIME.VIDEO)) return 'mp4';
    return 'tmp';
  }

  static async create(input: MediaInput, metadata?: z.infer<typeof StickerMetadataType>): Promise<Buffer> {
    try {
      const buffer = await BufferConverter.toBuffer(input);
      const fileType = await fileTypeFromBuffer(buffer);

      if (!fileType) throw new Error('Unable to detect file type');

      const quality = metadata?.quality || CONSTANTS.STICKER.DEFAULT_QUALITY;
      const isAnimated = MimeValidator.isAnimated(fileType.mime);

      const shape = metadata?.shape || 'default';
      const webpBuffer = isAnimated ? await this.processAnimated(buffer, fileType.mime, quality) : await ImageProcessor.resizeForSticker(buffer, quality, shape);

      const exif = this.createExifMetadata(metadata);
      const img = new webp.Image();
      await img.load(webpBuffer);
      img.exif = exif;

      const finalBuffer = await img.save(null);
      return Buffer.isBuffer(finalBuffer) ? finalBuffer : Buffer.from(finalBuffer);
    } catch (error) {
      throw new Error(`Sticker creation failed: ${error.message || error}`);
    }
  }
}

export class DocumentProcessor {
  static async create(input: MediaInput) {
    try {
      const buffer = await BufferConverter.toBuffer(input);
      const fileType = await fileTypeFromBuffer(buffer);

      if (!fileType) throw new Error('Unable to detect file type');

      return {
        document: buffer,
        mimetype: fileType.mime,
        fileName: generateId(Date.now().toString()),
        jpegThumbnail: await MediaProcessor.getThumbnail(buffer),
      };
    } catch (error) {
      throw new Error(`Document creation failed: ${error.message || error}`);
    }
  }
}

export const toBuffer = BufferConverter.toBuffer.bind(BufferConverter);
export const getWaAudio = AudioProcessor.getWaAudio.bind(AudioProcessor);
export const getWaImage = ImageProcessor.getWaImage.bind(ImageProcessor);
export const getWaVideo = VideoProcessor.getWaVideo.bind(VideoProcessor);
export const getVideoThumbnail = VideoProcessor.getThumbnail.bind(VideoProcessor);
export const getVideoDuration = VideoProcessor.getDuration.bind(VideoProcessor);
export const getMediaThumbnail = MediaProcessor.getThumbnail.bind(MediaProcessor);
export const getWaSticker = StickerProcessor.create.bind(StickerProcessor);
export const getWaDocument = DocumentProcessor.create.bind(DocumentProcessor);
