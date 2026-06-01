import { BufferConverter, FFMPEG_CONSTANTS, MimeValidator, detectFileType, type MediaInput } from './core.js';
import { ffmpegTransform } from './transform.js';

export type AudioType = 'opus' | 'mp3';

const WAVEFORM_SAMPLES = 64;
const WAVEFORM_RATE = 8000;

export class AudioProcessor {
  static async toOpus(input: MediaInput): Promise<Buffer> {
    return this.convert(input, 'opus');
  }

  static async toMp3(input: MediaInput): Promise<Buffer> {
    return this.convert(input, 'mp3');
  }

  static async convert(input: MediaInput, type: AudioType = 'opus'): Promise<Buffer> {
    const buffer = await BufferConverter.toBuffer(input);
    MimeValidator.validate(await detectFileType(buffer), FFMPEG_CONSTANTS.MIME.AUDIO);
    const inputExt = await BufferConverter.getExtension(buffer);
    const options =
      type === 'opus'
        ? ['-vn', '-c:a', 'libopus', '-b:a', '48k', '-ac', '1', '-avoid_negative_ts', 'make_zero', '-map_metadata', '-1', '-f', 'ogg']
        : ['-vn', '-c:a', 'libmp3lame', '-b:a', '128k', '-ac', '2', '-avoid_negative_ts', 'make_zero', '-map_metadata', '-1', '-f', 'mp3'];
    return ffmpegTransform(buffer, inputExt, type === 'opus' ? 'ogg' : 'mp3', `${type.toUpperCase()} conversion`, options);
  }

  static async waveform(input: MediaInput): Promise<{ waveform: Uint8Array; seconds: number }> {
    const buffer = await BufferConverter.toBuffer(input);
    const inputExt = await BufferConverter.getExtension(buffer);
    const pcm = await ffmpegTransform(buffer, inputExt, 'tmp', 'Waveform generation', [
      '-vn', '-ac', '1', '-ar', String(WAVEFORM_RATE), '-f', 's16le',
    ]);
    const sampleCount = Math.floor(pcm.length / 2);
    return {
      waveform: this.computeWaveform(pcm),
      seconds: Math.max(1, Math.round(sampleCount / WAVEFORM_RATE)),
    };
  }

  private static computeWaveform(pcm: Buffer): Uint8Array {
    const total = Math.floor(pcm.length / 2);
    const result = new Uint8Array(WAVEFORM_SAMPLES);
    if (total === 0) return result;
    const block = Math.max(1, Math.floor(total / WAVEFORM_SAMPLES));
    const averaged: number[] = [];
    for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
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
    for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
      result[i] = Math.floor((averaged[i]! / max) * 100);
    }
    return result;
  }
}
