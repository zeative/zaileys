import { fileTypeFromBuffer } from 'file-type';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';
import { isArrayBuffer, isBuffer, isString } from 'lodash';
import webp from 'node-webpmux';
import { tmpdir } from 'os';
import path from 'path';
import sharp from 'sharp';
import { generateId } from './message';
import { StickerMetadataType } from '../Types';
import z from 'zod';

const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const cleanup = async (files: string[]) => Promise.all(files.map((f) => fs.unlink(f).catch(() => {})));

const toBuffer = async (input: string | ArrayBuffer | Buffer): Promise<any> => {
  if (isBuffer(input)) return input;
  if (isArrayBuffer(input)) return Buffer.from(input);

  if (isString(input)) {
    if (input.startsWith('http')) {
      const res = await fetch(input);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
    return Buffer.from(input, 'base64');
  }

  throw new Error('Invalid input type');
};

const createTempFiles = (extIn: string, extOut: string) => {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return [path.join(tmpdir(), `audio_${id}.${extIn}`), path.join(tmpdir(), `audio_${id}.ogg`)];
};

export const convertToOpus = async (input: string | ArrayBuffer | Buffer): Promise<Buffer> => {
  const buffer = await toBuffer(input);
  const ft = await fileTypeFromBuffer(buffer);

  if (!ft?.mime.startsWith('audio/')) throw 'Not audio file';

  const [tempIn, tempOut] = createTempFiles('wav', 'ogg');
  await fs.writeFile(tempIn, Buffer.from(buffer));

  return new Promise((resolve, reject) => {
    ffmpeg(tempIn)
      .audioCodec('libopus')
      .audioChannels(1)
      .audioFrequency(48000)
      .audioBitrate('48k')
      .addOutputOptions(['-avoid_negative_ts', 'make_zero', '-map_metadata', '-1', '-f', 'ogg'])
      .output(tempOut)
      .on('end', async () => {
        const opusBuffer = await fs.readFile(tempOut);
        await cleanup([tempIn, tempOut]);
        resolve(opusBuffer);
      })
      .on('error', async (err) => {
        await cleanup([tempIn]);
        reject(err);
      })
      .run();
  });
};

export const getVideoThumbnail = async (input: string | ArrayBuffer | Buffer): Promise<string> => {
  const buffer = await toBuffer(input);
  const ft = await fileTypeFromBuffer(buffer);

  if (!ft?.mime.startsWith('video/')) throw 'Not video file';

  const [tempIn, , tempThumb] = [
    path.join(tmpdir(), `video_${Date.now()}.mp4`),
    path.join(tmpdir(), `video_${Date.now()}.jpg`),
    path.join(tmpdir(), `thumb_${Date.now()}.jpg`),
  ];

  await fs.writeFile(tempIn, Buffer.from(buffer));

  return new Promise((resolve, reject) => {
    ffmpeg(tempIn)
      .screenshots({
        timestamps: ['10%'],
        filename: path.basename(tempThumb),
        folder: path.dirname(tempThumb),
        size: '100x100',
        quality: 50,
      })
      .on('end', async () => {
        const thumbBuffer = await fs.readFile(tempThumb);
        await cleanup([tempIn, tempThumb]);
        resolve(thumbBuffer.toString('base64'));
      })
      .on('error', async (err) => {
        await cleanup([tempIn]);
        reject(err);
      });
  });
};

export const getVideoDuration = async (filePath: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const duration = metadata.format.duration || 0;
      resolve(duration);
    });
  });
};

export const getMediaThumbnail = async (input: string | ArrayBuffer | Buffer): Promise<string> => {
  const buffer = await toBuffer(input);
  const ft = await fileTypeFromBuffer(buffer);

  if (!ft || (!ft.mime.startsWith('image/') && !ft.mime.startsWith('video/'))) throw 'Invalid media type';
  if (ft.mime.startsWith('video/')) return getVideoThumbnail(input);

  const sharpProc = ft.mime === 'image/gif' ? sharp(buffer, { animated: false }) : sharp(buffer);

  return sharpProc
    .resize(100, 100, { fit: 'cover' })
    .jpeg({ quality: 50 })
    .toBuffer()
    .then((b) => b.toString('base64'));
};

const createExifMetadata = (metadata: z.infer<typeof StickerMetadataType>): Buffer => {
  const json = {
    'sticker-pack-id': generateId(Date.now().toString()),
    'sticker-pack-name': metadata?.packageName || 'Zaileys Library',
    'sticker-pack-publisher': metadata?.authorName || 'https://github.com/zeative/zaileys',
    emojis: ['🤓'],
    'android-app-store-link': 'https://play.google.com/store/apps/details?id=com.marsvard.stickermakerforwhatsapp',
    'ios-app-store-link': 'https://itunes.apple.com/app/sticker-maker-studio/id1443326857',
  };

  const exifAttr = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);

  const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
  const exif = Buffer.concat([exifAttr, jsonBuffer]);
  exif.writeUIntLE(jsonBuffer.length, 14, 4);

  return exif;
};

const processStaticSticker = async (buffer: Buffer, options: z.infer<typeof StickerMetadataType>): Promise<Buffer> => {
  return sharp(buffer)
    .resize(512, 512, {
      fit: 'cover',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: options?.quality || 80 })
    .toBuffer();
};

const processAnimatedSticker = async (buffer: Buffer, mimeType: string, options: z.infer<typeof StickerMetadataType>): Promise<Buffer> => {
  const id = generateId(Date.now().toString());
  let ext = 'tmp';

  if (mimeType === 'image/gif') ext = 'gif';
  else if (mimeType.startsWith('video/mp4')) ext = 'mp4';
  else if (mimeType.startsWith('video/')) ext = 'mp4';

  const tempIn = path.join(tmpdir(), `sticker_in_${id}.${ext}`);
  const tempOut = path.join(tmpdir(), `sticker_out_${id}.webp`);

  await fs.writeFile(tempIn, buffer);

  let duration = 10;
  try {
    const videoDuration = await getVideoDuration(tempIn);
    duration = Math.min(videoDuration, 10);
  } catch (err) {
    console.warn('Could not get video duration, using default 10s');
  }

  const videoFilter = 'scale=512:512:force_original_aspect_ratio=increase,crop=512:512,fps=15,format=rgba';

  return new Promise((resolve, reject) => {
    ffmpeg(tempIn)
      .outputOptions([
        '-vcodec libwebp',
        `-vf ${videoFilter}`,
        `-q:v ${Math.max(1, Math.min(100, 100 - (options?.quality || 80)))}`,
        '-loop 0',
        '-preset default',
        '-an',
        '-vsync 0',
        `-t ${duration}`,
        '-compression_level 6',
      ])
      .output(tempOut)
      .on('end', async () => {
        const webpBuffer = await fs.readFile(tempOut);
        await cleanup([tempIn, tempOut]);
        resolve(webpBuffer);
      })
      .on('error', async (err) => {
        await cleanup([tempIn, tempOut]);
        reject(new Error(`FFmpeg error: ${err.message}`));
      })
      .run();
  });
};

export const getWaSticker = async (input: string | Buffer | ArrayBuffer, metadata?: z.infer<typeof StickerMetadataType>): Promise<Buffer> => {
  try {
    const buffer = await toBuffer(input);
    const properBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

    const ft = await fileTypeFromBuffer(properBuffer);
    if (!ft) throw new Error('Unable to detect file type');

    let webpBuffer: Buffer;
    const isAnimated = ft.mime === 'image/gif' || ft.mime.startsWith('video/');

    if (isAnimated) {
      webpBuffer = await processAnimatedSticker(properBuffer, ft.mime, metadata);
    } else {
      webpBuffer = await processStaticSticker(properBuffer, metadata);
    }

    const exif = createExifMetadata(metadata);

    const img = new webp.Image();
    await img.load(webpBuffer);
    img.exif = exif;

    const finalBuffer = await img.save(null);
    return Buffer.isBuffer(finalBuffer) ? finalBuffer : Buffer.from(finalBuffer);
  } catch (error) {
    throw new Error(`Failed to create sticker: ${error.message || error}`);
  }
};
