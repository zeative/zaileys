import { fileTypeFromBuffer } from 'file-type';
import { generateId } from '../../Utils/message';
import { BufferConverter, type MediaInput } from './core';
import { ImageProcessor } from './image';
import { VideoProcessor } from './video';
import { FFMPEG_CONSTANTS, MimeValidator } from './core';

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
        fileName: generateId(Date.now().toString()),
        jpegThumbnail: thumbnail,
      };
    } catch (error: any) {
      throw new Error(`Document creation failed: ${error.message || error}`);
    }
  }
}
