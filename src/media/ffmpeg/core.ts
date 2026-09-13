import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';

import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

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
let ffmpegInitialized = false;

/**
 * The installer packages make their binary executable in a postinstall script, which pnpm 10 and
 * bun skip by default — leaving a `-rw-r--r--` file that fails every spawn with EACCES. Repair it
 * when we own the file, otherwise fall back to the system binary on PATH.
 */
export const resolveExecutable = async (bundled: string | undefined, systemName: string): Promise<string> => {
  if (bundled === undefined || bundled.length === 0) return systemName;
  /** Never throws: failing to pick a binary must degrade to PATH, not break media processing. */
  try {
    if (process.platform === 'win32') {
      await fs.access(bundled);
      return bundled;
    }
    const executable = (): Promise<boolean> => fs.access(bundled, fsConstants.X_OK).then(() => true, () => false);
    if (await executable()) return bundled;
    const { mode } = await fs.stat(bundled);
    await fs.chmod(bundled, mode | 0o100);
    return (await executable()) ? bundled : systemName;
  } catch {
    return systemName;
  }
};

export const initializeFFmpeg = async (disable: boolean = false) => {
  if (disable || ffmpegInitialized) return;
  ffmpegInitialized = true;

  const envFfmpeg = process.env['FFMPEG_PATH'];
  const envFfprobe = process.env['FFPROBE_PATH'];

  let bundledFfmpeg: string | undefined;
  try {
    bundledFfmpeg = (await import('@ffmpeg-installer/ffmpeg')).default?.path;
  } catch {}
  ffmpegPath = envFfmpeg ?? (await resolveExecutable(bundledFfmpeg, 'ffmpeg'));
  if (ffmpegPath !== 'ffmpeg') {
    const dir = path.dirname(ffmpegPath);
    const sep = process.platform === 'win32' ? ';' : ':';
    const current = process.env['PATH'] ?? '';
    if (!current.split(sep).includes(dir)) {
      process.env['PATH'] = `${dir}${sep}${current}`;
    }
  }

  let bundledFfprobe: string | undefined;
  try {
    bundledFfprobe = (await import('@ffprobe-installer/ffprobe')).default?.path;
  } catch {}
  ffprobePath = envFfprobe ?? (await resolveExecutable(bundledFfprobe, 'ffprobe'));
};

/** A hung child never settles its promise, leaks a PID and strands its temp files. */
const FFMPEG_TIMEOUT_MS = 120_000;
const FFPROBE_TIMEOUT_MS = 30_000;
const FFPROBE_MAX_STDOUT = 64 * 1024;
const URL_FETCH_TIMEOUT_MS = 30_000;
const URL_FETCH_MAX_BYTES = 64 * 1024 * 1024;

export interface MediaLimits {
  /** ffmpeg children running at once. Each 1080p re-encode holds ~235 MB of RSS. Default 4. */
  maxConcurrent: number;
  /** Jobs allowed to wait for a slot; beyond this new work is rejected. Default 64. */
  maxQueued: number;
  /** Longest a job may wait for a slot before it is rejected. Default 120000. */
  queueTimeoutMs: number;
  /** Largest image, in pixels, the decoders will accept. Default 50 MP. */
  maxImagePixels: number;
}

/**
 * Process-wide, like the ffmpeg children they govern: a server has one CPU and RAM budget no matter
 * how many clients share it. Without a queue bound a video flood kept memory flat but pushed job
 * latency past six minutes.
 */
const mediaLimits: MediaLimits = {
  maxConcurrent: 4,
  maxQueued: 64,
  queueTimeoutMs: 120_000,
  maxImagePixels: 50_000_000,
};

export const getMediaLimits = (): Readonly<MediaLimits> => ({ ...mediaLimits });

export const configureMediaLimits = (next: Partial<MediaLimits>): void => {
  const positiveInt = (name: keyof MediaLimits, value: number | undefined, min: number): void => {
    if (value === undefined) return;
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < min) {
      throw new Error(`invalid media limit ${name}: ${value}`);
    }
  };
  positiveInt('maxConcurrent', next.maxConcurrent, 1);
  positiveInt('maxQueued', next.maxQueued, 0);
  positiveInt('queueTimeoutMs', next.queueTimeoutMs, 1);
  positiveInt('maxImagePixels', next.maxImagePixels, 1);
  Object.assign(mediaLimits, Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)));
};

let activeFfmpeg = 0;
const ffmpegWaiters: Array<{ grant: () => void }> = [];

/**
 * A released slot is handed straight to the next waiter rather than freed, so a fresh caller
 * cannot slip in between and push the running count above the limit.
 */
const acquireFfmpegSlot = async (): Promise<() => void> => {
  if (activeFfmpeg < mediaLimits.maxConcurrent) {
    activeFfmpeg += 1;
  } else {
    if (ffmpegWaiters.length >= mediaLimits.maxQueued) {
      throw new Error(`ffmpeg queue is full (${mediaLimits.maxQueued} jobs waiting)`);
    }
    await new Promise<void>((resolve, reject) => {
      const waiter = {
        grant: (): void => {
          clearTimeout(timer);
          resolve();
        },
      };
      const timer = setTimeout(() => {
        const idx = ffmpegWaiters.indexOf(waiter);
        if (idx >= 0) ffmpegWaiters.splice(idx, 1);
        reject(new Error(`ffmpeg job waited more than ${mediaLimits.queueTimeoutMs}ms for a slot`));
      }, mediaLimits.queueTimeoutMs);
      ffmpegWaiters.push(waiter);
    });
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = ffmpegWaiters.shift();
    if (next) next.grant();
    else activeFfmpeg -= 1;
  };
};

export const generateId = (): string => Date.now().toString(36) + randomBytes(4).toString('hex');

export const detectFileType = async (buffer: Buffer): Promise<{ ext: string; mime: string } | undefined> => {
  const { fileTypeFromBuffer } = await import('file-type');
  return fileTypeFromBuffer(buffer);
};

export class FileManager {
  /** Unpredictable by design: a guessable name in a shared tmpdir is a symlink-overwrite target. */
  private static generateUniqueId(): string {
    return randomBytes(12).toString('hex');
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
      await fs.writeFile(filePath, data, { flag: 'wx', mode: 0o600 });
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
    /** Without this a slow-loris URL parks the caller forever; the builder loader already had one. */
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (buffer.byteLength > URL_FETCH_MAX_BYTES) {
        throw new Error(`Fetched body exceeds ${URL_FETCH_MAX_BYTES} bytes`);
      }
      return buffer;
    } catch (error: unknown) {
      throw new Error(`Failed to fetch URL: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timer);
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
  static validate(fileType: { mime: string } | undefined, expectedPrefix: string): void {
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
    await initializeFFmpeg();
    const release = await acquireFfmpegSlot();
    try {
      await new Promise<void>((resolve, reject) => {
        const args = ['-y', '-i', config.input, ...config.options, config.output];
        const child = spawn(ffmpegPath, args, { stdio: 'ignore' });
        let settled = false;
        const finish = (fn: () => void): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          fn();
        };
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          const err = new Error(`FFmpeg timed out after ${FFMPEG_TIMEOUT_MS}ms`);
          void Promise.resolve(config.onError(err)).catch(() => undefined);
          finish(() => reject(err));
        }, FFMPEG_TIMEOUT_MS);

        child.on('close', (code) => {
          if (settled) return;
          if (code === 0) {
            void Promise.resolve(config.onEnd()).then(
              () => finish(resolve),
              (error: unknown) => finish(() => reject(error)),
            );
            return;
          }
          const err = new Error(`FFmpeg exited with code ${code}`);
          void Promise.resolve(config.onError(err)).then(
            () => finish(() => reject(err)),
            (error: unknown) => finish(() => reject(error)),
          );
        });

        child.on('error', (err: Error) => {
          void Promise.resolve(config.onError(err)).finally(() => finish(() => reject(err)));
        });
      });
    } finally {
      release();
    }
  }

  /**
   * `filePath` lands in ffprobe's INPUT position, where `http://…`, `concat:` and a leading `-`
   * are all meaningful — so only an existing local file is accepted.
   */
  static async getDuration(filePath: string): Promise<number> {
    /** Resolve binaries first: otherwise ffprobe came from PATH until some ffmpeg job ran, then switched. */
    await initializeFFmpeg();
    if (typeof filePath !== 'string' || filePath.length === 0 || filePath.startsWith('-')) {
      throw new Error('getDuration expects a local file path');
    }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(filePath)) {
      throw new Error('getDuration does not accept protocol inputs');
    }
    const info = await fs.stat(filePath).catch(() => undefined);
    if (info === undefined || !info.isFile()) {
      throw new Error(`getDuration: not a readable file: ${filePath}`);
    }
    return new Promise((resolve, reject) => {
      const child = spawn(ffprobePath, [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath
      ]);

      let output = '';
      let settled = false;
      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish(() => reject(new Error(`ffprobe timed out after ${FFPROBE_TIMEOUT_MS}ms`)));
      }, FFPROBE_TIMEOUT_MS);

      child.stdout.on('data', (data) => {
        if (output.length > FFPROBE_MAX_STDOUT) return;
        output += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) finish(() => resolve(parseFloat(output.trim()) || 0));
        else finish(() => reject(new Error(`ffprobe exited with code ${code}`)));
      });
      child.on('error', (err) => finish(() => reject(err)));
    });
  }
}
