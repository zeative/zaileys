import { fileTypeFromBuffer } from 'file-type';
import { BufferConverter, FFMPEG_CONSTANTS, FFmpegProcessor, FileManager, MimeValidator, type MediaInput } from './core';

export type AudioType = 'opus' | 'mp3';

export class AudioProcessor {
  static async toOpus(input: MediaInput): Promise<Buffer> {
    return this.convert(input, 'opus');
  }

  static async toMp3(input: MediaInput): Promise<Buffer> {
    return this.convert(input, 'mp3');
  }

  static async convert(input: MediaInput, type: AudioType = 'opus'): Promise<Buffer> {
    const buffer = await BufferConverter.toBuffer(input);
    const fileType = await fileTypeFromBuffer(buffer);

    MimeValidator.validate(fileType, FFMPEG_CONSTANTS.MIME.AUDIO);
    
    const inputExt = await BufferConverter.getExtension(buffer);
    const tempIn = FileManager.createTempPath('audio_in', inputExt);
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
    } catch (error: any) {
      await FileManager.cleanup([tempIn, tempOut]);
      throw new Error(`${type.toUpperCase()} conversion failed: ${error.message}`);
    }
  }
}
