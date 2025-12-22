import ffmpeg from 'fluent-ffmpeg';
import { fileTypeFromBuffer } from 'file-type';
import path from 'path';
import { BufferConverter, FFMPEG_CONSTANTS, FFmpegProcessor, FileManager, MimeValidator, type MediaInput } from './core';

export class VideoProcessor {
  static async toMp4(input: MediaInput): Promise<Buffer> {
    const buffer = await BufferConverter.toBuffer(input);
    const fileType = await fileTypeFromBuffer(buffer);

    MimeValidator.validate(fileType, FFMPEG_CONSTANTS.MIME.VIDEO);

    const tempIn = FileManager.createTempPath('video_in', 'mp4');
    const tempOut = FileManager.createTempPath('video_out', 'mp4');

    await FileManager.safeWriteFile(tempIn, buffer);

    let outputBuffer: Buffer;

    try {
      const options = [
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        '-pix_fmt', 'yuv420p',
        '-f', 'mp4',
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
    } catch (error: any) {
      await FileManager.cleanup([tempIn, tempOut]);
      throw new Error(`Video re-encoding failed: ${error.message}`);
    }
  }

  static async thumbnail(input: MediaInput): Promise<string> {
    const buffer = await BufferConverter.toBuffer(input);
    const fileType = await fileTypeFromBuffer(buffer);

    MimeValidator.validate(fileType, FFMPEG_CONSTANTS.MIME.VIDEO);

    const tempIn = FileManager.createTempPath('video', 'mp4');
    const tempThumb = FileManager.createTempPath('thumb', 'jpg');

    await FileManager.safeWriteFile(tempIn, buffer);

    let thumbnailBase64: string;

    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(tempIn)
          .screenshots({
            timestamps: [FFMPEG_CONSTANTS.THUMBNAIL.TIMESTAMP],
            filename: path.basename(tempThumb),
            folder: path.dirname(tempThumb),
            size: `${FFMPEG_CONSTANTS.THUMBNAIL.SIZE}x${FFMPEG_CONSTANTS.THUMBNAIL.SIZE}`,
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
    } catch (error: any) {
      await FileManager.cleanup([tempIn, tempThumb]);
      throw new Error(`Thumbnail generation failed: ${error.message}`);
    }
  }

  static async duration(filePath: string): Promise<number> {
    return FFmpegProcessor.getDuration(filePath);
  }
}
