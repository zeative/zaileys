import { fileTypeFromBuffer } from 'file-type';
import { BufferConverter, FFMPEG_CONSTANTS, FFmpegProcessor, FileManager, MimeValidator, type MediaInput } from './core.js';

export type AudioType = 'opus' | 'mp3';

export class AudioProcessor {
  static async toOpus(input: MediaInput): Promise<Buffer> {
    return this.convert(input, 'opus');
  }

  static async waveform(input: MediaInput): Promise<{ waveform: Uint8Array; seconds: number }> {
    const buffer = await BufferConverter.toBuffer(input);
    const inputExt = await BufferConverter.getExtension(buffer);
    const tempIn = FileManager.createTempPath('wf_in', inputExt);
    const tempOut = FileManager.createTempPath('wf_out', 'tmp');
    await FileManager.safeWriteFile(tempIn, buffer);
    try {
      await FFmpegProcessor.process({
        input: tempIn,
        output: tempOut,
        options: ['-vn', '-ac', '1', '-ar', '8000', '-f', 's16le'],
        onEnd: async () => undefined,
        onError: async () => { await FileManager.cleanup([tempIn, tempOut]); },
      });
      const pcm = await FileManager.safeReadFile(tempOut);
      await FileManager.cleanup([tempIn, tempOut]);
      const sampleCount = Math.floor(pcm.length / 2);
      return {
        waveform: this.computeWaveform(pcm),
        seconds: Math.max(1, Math.round(sampleCount / 8000)),
      };
    } catch (error: unknown) {
      await FileManager.cleanup([tempIn, tempOut]);
      throw new Error(`Waveform generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private static computeWaveform(pcm: Buffer): Uint8Array {
    const samples = 64;
    const total = Math.floor(pcm.length / 2);
    const result = new Uint8Array(samples);
    if (total === 0) return result;
    const block = Math.max(1, Math.floor(total / samples));
    const averaged: number[] = [];
    for (let i = 0; i < samples; i++) {
      let sum = 0;
      let count = 0;
      for (let j = 0; j < block; j++) {
        const idx = (i * block + j) * 2;
        if (idx + 1 < pcm.length) {
          sum += Math.abs(pcm.readInt16LE(idx));
          count += 1;
        }
      }
      averaged.push(count > 0 ? sum / count : 0);
    }
    const max = Math.max(...averaged) || 1;
    for (let i = 0; i < samples; i++) {
      result[i] = Math.floor((averaged[i]! / max) * 100);
    }
    return result;
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
          ? ['-vn', '-c:a', 'libopus', '-b:a', '48k', '-ac', '1', '-avoid_negative_ts', 'make_zero', '-map_metadata', '-1', '-f', 'ogg']
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
    } catch (error: unknown) {
      await FileManager.cleanup([tempIn, tempOut]);
      throw new Error(`${type.toUpperCase()} conversion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
