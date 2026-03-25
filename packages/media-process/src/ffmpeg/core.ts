import fs from 'fs/promises';

import { tmpdir } from 'os';
import path from 'path';
import { spawn } from 'child_process';

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
    MAX_DURATION: 6,
    FPS: 10,
    DEFAULT_QUALITY: 60,
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

let ffmpegPath = 'ffmpeg';
let ffprobePath = 'ffprobe';

export const initializeFFmpeg = async (disable: boolean = false) => {
  if (disable) return;

  try {
    const ffmpegInstaller = (await import('@ffmpeg-installer/ffmpeg')).default;
    const ffprobeInstaller = (await import('@ffprobe-installer/ffprobe')).default;

    ffmpegPath = ffmpegInstaller.path;
    ffprobePath = ffprobeInstaller.path;
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
    
    try {
      if (await fs.stat(input).then(s => s.isFile()).catch(() => false)) {
        return await fs.readFile(input);
      }
    } catch {}

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

  static async getExtension(buffer: Buffer): Promise<FileExtension> {
    const { fileTypeFromBuffer } = await import('file-type');
    const type = await fileTypeFromBuffer(buffer);
    if (!type) return 'tmp';
    
    const ext = type.ext.toLowerCase();
    const validExtensions: FileExtension[] = ['wav', 'ogg', 'mp4', 'gif', 'jpg', 'webp', 'tmp', 'mp3', 'png'];
    return validExtensions.includes(ext as FileExtension) ? (ext as FileExtension) : 'tmp';
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
      const args = ['-y', '-i', config.input, ...config.options, config.output];
      const child = spawn(ffmpegPath, args, { stdio: 'ignore' });

      child.on('close', async (code) => {
        if (code === 0) {
          try {
            await config.onEnd();
            resolve();
          } catch (error) {
            reject(error);
          }
        } else {
          try {
            const err = new Error(`FFmpeg exited with code ${code}`);
            await config.onError(err);
            reject(err);
          } catch (error) {
            reject(error);
          }
        }
      });

      child.on('error', async (err: Error) => {
        try {
          await config.onError(err);
        } finally {
          reject(err);
        }
      });
    });
  }

  static async getDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const child = spawn(ffprobePath, [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath
      ]);

      let output = '';
      child.stdout.on('data', (data) => output += data.toString());
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve(parseFloat(output.trim()) || 0);
        } else {
          reject(new Error(`ffprobe exited with code ${code}`));
        }
      });
      child.on('error', reject);
    });
  }
}
