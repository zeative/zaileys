import { BufferConverter, FFMPEG_CONSTANTS, FFmpegProcessor, MimeValidator, detectFileType, type MediaInput } from './core.js';
import { ffmpegTransform } from './transform.js';

const MP4_OPTIONS = [
  '-c:v', 'libx264',
  '-preset', 'ultrafast',
  '-crf', '28',
  '-c:a', 'aac',
  '-b:a', '128k',
  '-movflags', '+faststart',
  '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
  '-pix_fmt', 'yuv420p',
  '-f', 'mp4',
];

export class VideoProcessor {
  static async toMp4(input: MediaInput): Promise<Buffer> {
    const buffer = await BufferConverter.toBuffer(input);
    MimeValidator.validate(await detectFileType(buffer), FFMPEG_CONSTANTS.MIME.VIDEO);
    const inputExt = await BufferConverter.getExtension(buffer);
    return ffmpegTransform(buffer, inputExt, 'mp4', 'Video re-encoding', MP4_OPTIONS);
  }

  static async thumbnail(input: MediaInput): Promise<string> {
    const buffer = await BufferConverter.toBuffer(input);
    MimeValidator.validate(await detectFileType(buffer), FFMPEG_CONSTANTS.MIME.VIDEO);
    const inputExt = await BufferConverter.getExtension(buffer);
    const size = FFMPEG_CONSTANTS.THUMBNAIL.SIZE;
    const thumb = await ffmpegTransform(buffer, inputExt, 'jpg', 'Thumbnail generation', async (tempIn) => {
      const duration = await FFmpegProcessor.getDuration(tempIn);
      const targetTime = Math.max(0, duration * 0.1);
      return ['-ss', targetTime.toString(), '-vframes', '1', '-s', `${size}x${size}`];
    });
    return thumb.toString('base64');
  }

  static async duration(filePath: string): Promise<number> {
    return FFmpegProcessor.getDuration(filePath);
  }
}
