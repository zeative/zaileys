import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';
import _ from 'lodash';
import { tmpdir } from 'os';
import path from 'path';

export const FFMPEG_CONSTANTS = {
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

export type MediaInput = string | ArrayBuffer | Buffer;
export type FileExtension = 'wav' | 'ogg' | 'mp4' | 'gif' | 'jpg' | 'webp' | 'tmp' | 'mp3' | 'png';

export interface FFmpegConfig {
  input: string;
  output: string;
  options: string[];
  onEnd: () => Promise<void>;
  onError: (err: Error) => Promise<void>;
}

export const initializeFFmpeg = async (disable: boolean = false) => {
  if (disable) return;

  try {
    const ffmpegInstaller = (await import('@ffmpeg-installer/ffmpeg')).default;
    const ffprobeInstaller = (await import('@ffprobe-installer/ffprobe')).default;

    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
    ffmpeg.setFfprobePath(ffprobeInstaller.path);
  } catch {}
};

export class FileManager {
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
    } catch {
      throw new Error(`Failed to read file: ${filePath}`);
    }
  }

  static async safeWriteFile(filePath: string, data: Buffer): Promise<void> {
    try {
      await fs.writeFile(filePath, data);
    } catch {
      throw new Error(`Failed to write file: ${filePath}`);
    }
  }
}

export class BufferConverter {
  static async toBuffer(input: MediaInput): Promise<Buffer> {
    if (Buffer.isBuffer(input)) return input;
    if (input instanceof ArrayBuffer) return Buffer.from(input);
    if (typeof input === 'string') return this.fromString(input);

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
    } catch (error: any) {
      throw new Error(`Failed to fetch URL: ${error.message}`);
    }
  }
}

export class MimeValidator {
  static validate(fileType: any, expectedPrefix: string): void {
    if (!fileType?.mime?.startsWith(expectedPrefix)) {
      throw new Error(`Invalid file type: expected ${expectedPrefix}*, got ${fileType?.mime || 'unknown'}`);
    }
  }

  static isMedia(mime: string): boolean {
    return mime.startsWith(FFMPEG_CONSTANTS.MIME.IMAGE) || mime.startsWith(FFMPEG_CONSTANTS.MIME.VIDEO);
  }

  static isAnimated(mime: string): boolean {
    return mime === FFMPEG_CONSTANTS.MIME.GIF || mime.startsWith(FFMPEG_CONSTANTS.MIME.VIDEO);
  }
}

export class FFmpegProcessor {
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
