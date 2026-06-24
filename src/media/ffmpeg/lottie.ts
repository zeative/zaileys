import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { FileManager, FFMPEG_CONSTANTS, generateId, initializeFFmpeg, ffmpegBin } from './core.js';

interface RlottieModule {
  cwrap: (name: string, ret: string | null, args: string[]) => (...args: number[]) => number | null;
  HEAPU8: Uint8Array;
  _malloc: (size: number) => number;
}

interface RlottieApi {
  lottie_init: () => number;
  lottie_destroy: (handle: number) => void;
  lottie_resize: (handle: number, w: number, h: number) => void;
  lottie_buffer: (handle: number) => number;
  lottie_render: (handle: number, frameNo: number) => void;
  lottie_load_from_data: (handle: number, ptr: number) => number;
  HEAPU8: Uint8Array;
  _malloc: (size: number) => number;
}

interface FflateSync {
  gunzipSync: (data: Uint8Array) => Uint8Array;
  unzipSync: (data: Uint8Array) => Record<string, Uint8Array>;
}

let _rlottie: RlottieApi | null = null;
let _rlottieChecked = false;
let _fflate: FflateSync | null = null;
let _fflateChecked = false;

async function resolveRlottieWasmPath(): Promise<{ wasmPath: string; jsPath: string } | null> {
  try {
    const wasmUrl: string = import.meta.resolve('rlottie/wasm');
    const { fileURLToPath } = await import('node:url');
    const wasmPath = fileURLToPath(wasmUrl);
    return { wasmPath, jsPath: wasmPath.replace('/rlottie.wasm', '/rlottie.js') };
  } catch {
    /** ESM resolve unavailable — fall through to CJS */
  }
  try {
    type RequireLike = { (id: string): unknown; resolve: (id: string) => string };
    const req = (typeof require !== 'undefined' ? require : null) as RequireLike | null;
    if (req) {
      const apiPath: string = req.resolve('rlottie');
      const dir = path.dirname(apiPath);
      return { wasmPath: path.join(dir, 'rlottie.wasm'), jsPath: path.join(dir, 'rlottie.js') };
    }
  } catch {
    /** no-op */
  }
  return null;
}

async function buildApiFromModule(m: RlottieModule): Promise<RlottieApi> {
  const wrap = <T extends (...a: number[]) => number | null>(name: string, ret: string | null, args: string[]): T =>
    m.cwrap(name, ret, args) as T;
  return {
    lottie_init: wrap<() => number>('lottie_init', 'number', []),
    lottie_destroy: (h) => { m.cwrap('lottie_destroy', null, ['number'])(h); },
    lottie_resize: (h, w, ht) => { m.cwrap('lottie_resize', null, ['number', 'number', 'number'])(h, w, ht); },
    lottie_buffer: wrap<(h: number) => number>('lottie_buffer', 'number', ['number']),
    lottie_render: (h, f) => { m.cwrap('lottie_render', null, ['number', 'number'])(h, f); },
    lottie_load_from_data: wrap<(h: number, ptr: number) => number>('lottie_load_from_data', 'number', ['number', 'number']),
    HEAPU8: m.HEAPU8,
    _malloc: m._malloc,
  };
}

async function getRlottie(): Promise<RlottieApi | null> {
  if (_rlottieChecked) return _rlottie;
  _rlottieChecked = true;
  try {
    /**
     * Path A: import rlottie package directly — mockable in tests; works when fetch is available.
     * In plain Node the emscripten fetch will throw; we catch and fall through to path B.
     */
    try {
      const { init } = (await import('rlottie')) as { init: (url?: string) => RlottieApi | Promise<RlottieApi> };
      const paths = await resolveRlottieWasmPath();
      const wasmUrl = paths ? pathToFileURL(paths.wasmPath).href : undefined;
      _rlottie = await init(wasmUrl);
      return _rlottie;
    } catch {
      /** fetch-based init failed — try binary load */
    }

    /** Path B: read wasm binary directly; bypasses emscripten fetch, reliable in Node. */
    const paths = await resolveRlottieWasmPath();
    if (paths) {
      const wasmBinary = await fs.readFile(paths.wasmPath);
      const imported = (await import(pathToFileURL(paths.jsPath).href)) as {
        default: (opts: { wasmBinary: Uint8Array }) => Promise<RlottieModule>;
      };
      _rlottie = await buildApiFromModule(await imported.default({ wasmBinary }));
    }
  } catch {
    _rlottie = null;
  }
  return _rlottie;
}

async function getFflate(): Promise<FflateSync | null> {
  if (_fflateChecked) return _fflate;
  _fflateChecked = true;
  try {
    const mod = (await import('fflate')) as FflateSync & { default?: FflateSync };
    const candidate = mod.default ?? mod;
    if (typeof candidate.gunzipSync === 'function') _fflate = candidate;
  } catch {
    _fflate = null;
  }
  return _fflate;
}

interface LottieAsset {
  id?: string;
  u?: string;
  p?: string;
  e?: number;
  [k: string]: unknown;
}

interface LottieData {
  fr?: number;
  ip?: number;
  op?: number;
  w?: number;
  h?: number;
  layers?: unknown[];
  assets?: LottieAsset[];
  [k: string]: unknown;
}

const ZIP_SIG = [0x50, 0x4b, 0x03, 0x04] as const;
const GZIP_SIG = [0x1f, 0x8b] as const;

function bufStartsWith(buf: Buffer, sig: readonly number[]): boolean {
  return sig.every((b, i) => buf[i] === b);
}

export function isLottieWas(buffer: Buffer): boolean {
  if (buffer.length < 2) return false;
  if (bufStartsWith(buffer, ZIP_SIG)) return true;
  if (bufStartsWith(buffer, GZIP_SIG)) return true;
  if (buffer[0] === 0x7b) {
    try {
      const obj = JSON.parse(buffer.toString('utf8')) as LottieData;
      return typeof obj === 'object' && obj !== null && ('layers' in obj || 'fr' in obj);
    } catch {
      return false;
    }
  }
  return false;
}

async function extractLottieJson(buffer: Buffer): Promise<LottieData> {
  if (bufStartsWith(buffer, ZIP_SIG)) {
    const fflate = await getFflate();
    if (!fflate) throw new Error('fflate not installed; run: pnpm add fflate');
    const files = fflate.unzipSync(new Uint8Array(buffer));
    const jsonKey = Object.keys(files).find(
      (k) =>
        k === 'animation/data.json' ||
        k === 'animation.json' ||
        (k.endsWith('.json') && !k.includes('manifest')),
    );
    if (!jsonKey) throw new Error('No Lottie JSON found in .was ZIP');
    const data = JSON.parse(Buffer.from(files[jsonKey]!).toString('utf8')) as LottieData;

    if (Array.isArray(data.assets)) {
      for (const asset of data.assets) {
        if (asset['e'] === 0 && typeof asset['u'] === 'string' && typeof asset['p'] === 'string') {
          const imgPath = (asset['u'] as string) + (asset['p'] as string);
          const imgKey = Object.keys(files).find((k) => k === imgPath || k.endsWith('/' + (asset['p'] as string)));
          if (imgKey && files[imgKey]) {
            asset['p'] = 'data:image/png;base64,' + Buffer.from(files[imgKey]!).toString('base64');
            asset['u'] = '';
            asset['e'] = 1;
          }
        }
      }
    }
    return data;
  }

  if (bufStartsWith(buffer, GZIP_SIG)) {
    const fflate = await getFflate();
    if (!fflate) throw new Error('fflate not installed; run: pnpm add fflate');
    const out = fflate.gunzipSync(new Uint8Array(buffer));
    return JSON.parse(Buffer.from(out).toString('utf8')) as LottieData;
  }

  return JSON.parse(buffer.toString('utf8')) as LottieData;
}

async function rgbaToPng(rgba: Uint8Array, w: number, h: number, outPath: string): Promise<void> {
  await initializeFFmpeg();
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-f', 'rawvideo',
      '-pixel_format', 'rgba',
      '-video_size', `${w}x${h}`,
      '-i', 'pipe:0',
      '-frames:v', '1',
      '-f', 'image2',
      outPath,
    ];
    const child = spawn(ffmpegBin, args, { stdio: ['pipe', 'ignore', 'ignore'] });
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg rawvideo exit ${code}`))));
    child.on('error', reject);
    child.stdin!.end(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength));
  });
}

async function assembleWebp(framesDir: string, fps: number, w: number, h: number, quality: number): Promise<string> {
  await initializeFFmpeg();
  const outPath = path.join(framesDir, 'out.webp');
  const q = Math.max(1, Math.min(100, quality));
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-framerate', String(fps),
      '-i', path.join(framesDir, 'frame_%04d.png'),
      '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=rgba`,
      '-vcodec', 'libwebp',
      '-loop', '0',
      '-q:v', String(q),
      '-preset', 'default',
      '-compression_level', String(FFMPEG_CONSTANTS.STICKER.COMPRESSION_LEVEL),
      '-an',
      outPath,
    ];
    const child = spawn(ffmpegBin, args, { stdio: 'ignore' });
    child.on('close', (code) => (code === 0 ? resolve(outPath) : reject(new Error(`ffmpeg webp assembly exit ${code}`))));
    child.on('error', reject);
  });
}

const LOTTIE_SIZE = FFMPEG_CONSTANTS.STICKER.SIZE;
const LOTTIE_MAX_FPS = 15;
const LOTTIE_MAX_DURATION_SEC = 3;

export class LottieProcessor {
  static async toWebp(buffer: Buffer, quality: number = FFMPEG_CONSTANTS.STICKER.DEFAULT_QUALITY): Promise<Buffer> {
    const api = await getRlottie();
    if (!api) throw new Error('rlottie not installed; run: pnpm add rlottie');

    const lottieData = await extractLottieJson(buffer);
    const srcFps = Math.max(1, Number(lottieData.fr) || 24);
    const ip = Number(lottieData.ip) || 0;
    const op = Number(lottieData.op) || ip + srcFps;
    const totalFrames = op - ip;
    const targetFps = Math.min(srcFps, LOTTIE_MAX_FPS);
    const capFrames = Math.min(totalFrames, Math.ceil(LOTTIE_MAX_DURATION_SEC * targetFps));

    const W = LOTTIE_SIZE, H = LOTTIE_SIZE;
    const handle = api.lottie_init();
    const jsonBuf = Buffer.from(JSON.stringify(lottieData) + '\0');
    const ptr = api._malloc(jsonBuf.length);
    const heap = api.HEAPU8;
    for (let i = 0; i < jsonBuf.length; i++) heap[ptr + i] = jsonBuf[i]!;
    api.lottie_load_from_data(handle, ptr);
    api.lottie_resize(handle, W, H);

    const tempDir = path.join(getTmpdir(), `lottie_${generateId()}`);
    await fs.mkdir(tempDir, { recursive: true });

    try {
      const stride = W * H * 4;
      for (let f = 0; f < capFrames; f++) {
        api.lottie_render(handle, ip + f);
        const bufPtr = api.lottie_buffer(handle);
        const rgba = new Uint8Array(api.HEAPU8.buffer.slice(bufPtr, bufPtr + stride));
        await rgbaToPng(rgba, W, H, path.join(tempDir, `frame_${String(f).padStart(4, '0')}.png`));
      }
      api.lottie_destroy(handle);

      const outPath = await assembleWebp(tempDir, targetFps, W, H, quality);
      return await FileManager.safeReadFile(outPath);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

function getTmpdir(): string {
  return os.tmpdir();
}
