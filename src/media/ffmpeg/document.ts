import { fileTypeFromBuffer } from 'file-type';
import { generateId } from '../utils.js';
import { BufferConverter, type MediaInput } from './core.js';
import { ImageProcessor } from './image.js';
import { VideoProcessor } from './video.js';
import { FFMPEG_CONSTANTS, MimeValidator } from './core.js';

export class DocumentProcessor {
  static async create(input: MediaInput) {
    try {
      const buffer = await BufferConverter.toBuffer(input);
      const fileType = await fileTypeFromBuffer(buffer);

      if (!fileType) throw new Error('Unable to detect file type');

      let thumbnail: string;

      if (fileType.mime.startsWith(FFMPEG_CONSTANTS.MIME.VIDEO)) {
        thumbnail = await VideoProcessor.thumbnail(buffer);
      } else if (MimeValidator.isMedia(fileType.mime)) {
        thumbnail = await ImageProcessor.thumbnail(buffer);
      } else {
        thumbnail = '';
      }

      return {
        document: buffer,
        mimetype: fileType.mime,
        ext: fileType.ext,
        fileName: generateId(),
        jpegThumbnail: thumbnail,
      };
    } catch (error: unknown) {
      throw new Error(`Document creation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
