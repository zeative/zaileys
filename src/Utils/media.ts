import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import { tmpdir } from 'os';
import fs from 'fs/promises';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { isString, isBuffer, isArrayBuffer } from 'lodash';

const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const cleanup = async (files: string[]) => Promise.all(files.map((f) => fs.unlink(f).catch(() => {})));

const toBuffer = async (input: string | ArrayBuffer | Buffer): Promise<any> => {
  if (isArrayBuffer(input) || isBuffer(input)) return input;
  if (isString(input)) {
    if (input.startsWith('http')) {
      const res = await fetch(input);
      if (!res.ok) throw `HTTP ${res.status}`;
      return res.arrayBuffer();
    }
    return Buffer.from(input, 'base64');
  }
  throw 'Invalid input';
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
