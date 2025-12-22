import z from 'zod';
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

class AudioModifier {
  private input: MediaInput;

  constructor(input: MediaInput) {
    this.input = input;
  }

  async toOpus(): Promise<Buffer> {
    return AudioProcessor.toOpus(this.input);
  }

  async toMp3(): Promise<Buffer> {
    return AudioProcessor.toMp3(this.input);
  }

  async convert(type: AudioType = 'opus'): Promise<Buffer> {
    return AudioProcessor.convert(this.input, type);
  }
}

class VideoModifier {
  private input: MediaInput;

  constructor(input: MediaInput) {
    this.input = input;
  }

  async toMp4(): Promise<Buffer> {
    return VideoProcessor.toMp4(this.input);
  }

  async thumbnail(): Promise<string> {
    return VideoProcessor.thumbnail(this.input);
  }
}

class ImageModifier {
  private input: MediaInput;

  constructor(input: MediaInput) {
    this.input = input;
  }

  async toJpeg(): Promise<Buffer> {
    return ImageProcessor.toJpeg(this.input);
  }

  async thumbnail(): Promise<string> {
    const buffer = await BufferConverter.toBuffer(this.input);
    return ImageProcessor.thumbnail(buffer);
  }

  async resize(width: number, height: number): Promise<Buffer> {
    const buffer = await BufferConverter.toBuffer(this.input);
    return ImageProcessor.resize(buffer, width, height);
  }
}

class StickerModifier {
  private input: MediaInput;
  private metadata?: z.infer<typeof StickerMetadataType>;

  constructor(input: MediaInput, metadata?: z.infer<typeof StickerMetadataType>) {
    this.input = input;
    this.metadata = metadata;
  }

  async create(): Promise<Buffer> {
    return StickerProcessor.create(this.input, this.metadata);
  }
}

class DocumentModifier {
  private input: MediaInput;

  constructor(input: MediaInput) {
    this.input = input;
  }

  async create() {
    return DocumentProcessor.create(this.input);
  }
}

class MediaThumbnailModifier {
  private input: MediaInput;

  constructor(input: MediaInput) {
    this.input = input;
  }

  async get(): Promise<string> {
    const buffer = await BufferConverter.toBuffer(this.input);
    const fileType = await fileTypeFromBuffer(buffer);

    if (!fileType || !MimeValidator.isMedia(fileType.mime)) {
      throw new Error('Invalid media type: expected image or video');
    }

    if (fileType.mime.startsWith(FFMPEG_CONSTANTS.MIME.VIDEO)) {
      return VideoProcessor.thumbnail(this.input);
    }

    return ImageProcessor.thumbnail(buffer);
  }
}

export class MediaModifier {
  audio(input: MediaInput): AudioModifier {
    return new AudioModifier(input);
  }

  video(input: MediaInput): VideoModifier {
    return new VideoModifier(input);
  }

  image(input: MediaInput): ImageModifier {
    return new ImageModifier(input);
  }

  sticker(input: MediaInput, metadata?: z.infer<typeof StickerMetadataType>): StickerModifier {
    return new StickerModifier(input, metadata);
  }

  document(input: MediaInput): DocumentModifier {
    return new DocumentModifier(input);
  }

  thumbnail(input: MediaInput): MediaThumbnailModifier {
    return new MediaThumbnailModifier(input);
  }

  async toBuffer(input: MediaInput): Promise<Buffer> {
    return BufferConverter.toBuffer(input);
  }
}

export const mediaModifier = new MediaModifier();
