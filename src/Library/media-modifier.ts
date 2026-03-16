import * as v from 'valibot';
import { StickerMetadataType } from '../Types';
import {
  AudioProcessor,
  type AudioType,
  BufferConverter,
  DocumentProcessor,
  FFMPEG_CONSTANTS,
  ImageProcessor,
  type MediaInput,
  MimeValidator,
  StickerProcessor,
  VideoProcessor,
} from './ffmpeg';
import { fileTypeFromBuffer } from 'file-type';

export class Media {
  private input: MediaInput;

  constructor(input: MediaInput) {
    this.input = input;
  }

  public get audio() {
    return {
      toOpus: () => AudioProcessor.toOpus(this.input),
      toMp3: () => AudioProcessor.toMp3(this.input),
      convert: (type: AudioType = 'opus') => AudioProcessor.convert(this.input, type),
    };
  }

  public get video() {
    return {
      toMp4: () => VideoProcessor.toMp4(this.input),
      thumbnail: () => VideoProcessor.thumbnail(this.input),
    };
  }

  public get image() {
    return {
      toJpeg: () => ImageProcessor.toJpeg(this.input),
      thumbnail: async () => {
        const buffer = await BufferConverter.toBuffer(this.input);
        return ImageProcessor.thumbnail(buffer);
      },
      resize: async (width: number, height: number) => {
        const buffer = await BufferConverter.toBuffer(this.input);
        return ImageProcessor.resize(buffer, width, height);
      },
    };
  }

  public get sticker() {
    return {
      create: (metadata?: v.InferInput<typeof StickerMetadataType>) => StickerProcessor.create(this.input, metadata),
    };
  }

  public get document() {
    return {
      create: () => DocumentProcessor.create(this.input),
    };
  }

  public get thumbnail() {
    return {
      get: async () => {
        const buffer = await BufferConverter.toBuffer(this.input);
        const fileType = await fileTypeFromBuffer(buffer);

        if (!fileType || !MimeValidator.isMedia(fileType.mime)) {
          throw new Error('Invalid media type: expected image or video');
        }

        if (fileType.mime.startsWith(FFMPEG_CONSTANTS.MIME.VIDEO)) {
          return VideoProcessor.thumbnail(this.input);
        }

        return ImageProcessor.thumbnail(buffer);
      },
    };
  }

  public async toBuffer(): Promise<Buffer> {
    return BufferConverter.toBuffer(this.input);
  }
}
