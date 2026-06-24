import { describe, expect, it, vi, beforeEach } from 'vitest'

// --- mock rlottie lazy loader so tests don't need actual wasm ---

// 2MB heap: bufPtr=0, stride=512*512*4=1MB fits comfortably
const HEAP_SIZE = 2 * 1024 * 1024
const mockHeap = new Uint8Array(HEAP_SIZE)
const BUF_PTR = 0 // lottie_buffer returns this

const mockApi = {
  lottie_init: vi.fn(() => 100),
  lottie_destroy: vi.fn(),
  lottie_resize: vi.fn(),
  lottie_render: vi.fn(() => {
    // fill RGBA red at BUF_PTR
    const stride = 512 * 512 * 4
    for (let i = 0; i < stride; i += 4) {
      mockHeap[BUF_PTR + i] = 255
      mockHeap[BUF_PTR + i + 1] = 0
      mockHeap[BUF_PTR + i + 2] = 0
      mockHeap[BUF_PTR + i + 3] = 255
    }
  }),
  lottie_buffer: vi.fn(() => BUF_PTR),
  lottie_load_from_data: vi.fn(() => 6),
  HEAPU8: mockHeap,
  _malloc: vi.fn(() => 1024 * 1024 + 4096), // ptr in upper half of heap
}

// mock rlottie module — getRlottie() will call import('rlottie/wasm') indirectly via getRlottie
// We mock at the module level by intercepting lottie.ts internals via vi.mock on rlottie
vi.mock('rlottie', () => ({
  init: vi.fn(async () => mockApi),
}))

// mock fflate for gzip test
import { gzipSync } from 'fflate'

// mock ffmpeg calls so tests are fast and don't need real ffmpeg
vi.mock('../../src/media/ffmpeg/core.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/media/ffmpeg/core.js')>(
    '../../src/media/ffmpeg/core.js',
  )
  return {
    ...actual,
    initializeFFmpeg: vi.fn(async () => undefined),
    ffmpegBin: 'ffmpeg',
    FileManager: {
      ...actual.FileManager,
      safeReadFile: vi.fn(async () => {
        // return a valid minimal animated webp: RIFF....WEBP header
        const buf = Buffer.alloc(20)
        buf.write('RIFF', 0, 'ascii')
        buf.writeUInt32LE(12, 4)
        buf.write('WEBP', 8, 'ascii')
        return buf
      }),
      safeWriteFile: vi.fn(async () => undefined),
      cleanup: vi.fn(async () => undefined),
      createTempPath: actual.FileManager.createTempPath,
    },
  }
})

// mock node:child_process spawn to avoid real ffmpeg
vi.mock('node:child_process', () => {
  const EventEmitter = require('node:events')
  class FakeChild extends EventEmitter {
    stdin = { end: vi.fn() }
    stdout = new EventEmitter()
    stderr = new EventEmitter()
    constructor() {
      super()
      Promise.resolve().then(() => this.emit('close', 0))
    }
  }
  return { spawn: vi.fn(() => new FakeChild()) }
})

// mock node:fs/promises so mkdir/rm/writeFile/readFile don't touch disk
vi.mock('node:fs/promises', () => {
  const fns = {
    mkdir: vi.fn(async () => undefined),
    rm: vi.fn(async () => undefined),
    writeFile: vi.fn(async () => undefined),
    readFile: vi.fn(async (p: string) => {
      if (String(p).endsWith('.wasm')) return Buffer.alloc(8)
      return Buffer.from('PNG_STUB')
    }),
    unlink: vi.fn(async () => undefined),
  }
  return { default: fns, ...fns }
})

// mock pathToFileURL to avoid ESM url issues in test env
vi.mock('node:url', async () => {
  const actual = await vi.importActual<typeof import('node:url')>('node:url')
  return {
    ...actual,
    pathToFileURL: (p: string) => ({ href: `file://${p}` }),
  }
})

import { isLottieWas, LottieProcessor } from '../../src/media/ffmpeg/lottie.js'

const MINIMAL_LOTTIE = {
  v: '5.7.0', fr: 15, ip: 0, op: 5, w: 512, h: 512,
  layers: [{
    ty: 1, sw: 512, sh: 512, sc: '#ff0000',
    ks: {
      o: { a: 0, k: 100 }, r: { a: 0, k: 0 },
      p: { a: 0, k: [256, 256] }, a: { a: 0, k: [256, 256] }, s: { a: 0, k: [100, 100] },
    },
    ip: 0, op: 5, st: 0, bm: 0,
  }],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('isLottieWas', () => {
  it('LW1: returns true for raw Lottie JSON', () => {
    const buf = Buffer.from(JSON.stringify(MINIMAL_LOTTIE))
    expect(isLottieWas(buf)).toBe(true)
  })

  it('LW2: returns true for gzip-compressed Lottie JSON', () => {
    const raw = Buffer.from(JSON.stringify(MINIMAL_LOTTIE))
    const gz = Buffer.from(gzipSync(raw))
    expect(isLottieWas(gz)).toBe(true)
  })

  it('LW3: returns false for PNG magic bytes', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(isLottieWas(png)).toBe(false)
  })

  it('LW4: returns false for JPEG magic bytes', () => {
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
    expect(isLottieWas(jpg)).toBe(false)
  })

  it('LW5: returns false for non-Lottie JSON', () => {
    const buf = Buffer.from(JSON.stringify({ hello: 'world' }))
    expect(isLottieWas(buf)).toBe(false)
  })

  it('LW6: returns false for empty buffer', () => {
    expect(isLottieWas(Buffer.alloc(0))).toBe(false)
  })
})

describe('LottieProcessor.toWebp', () => {
  it('LP1: raw Lottie JSON → returns Buffer with RIFF/WEBP header', async () => {
    const input = Buffer.from(JSON.stringify(MINIMAL_LOTTIE))
    const out = await LottieProcessor.toWebp(input)
    expect(Buffer.isBuffer(out)).toBe(true)
    expect(out.length).toBeGreaterThan(0)
    expect(out.slice(0, 4).toString('ascii')).toBe('RIFF')
    expect(out.slice(8, 12).toString('ascii')).toBe('WEBP')
  })

  it('LP2: gzip-compressed Lottie JSON → returns WEBP buffer', async () => {
    const raw = Buffer.from(JSON.stringify(MINIMAL_LOTTIE))
    const gz = Buffer.from(gzipSync(raw))
    const out = await LottieProcessor.toWebp(gz)
    expect(out.slice(0, 4).toString('ascii')).toBe('RIFF')
    expect(out.slice(8, 12).toString('ascii')).toBe('WEBP')
  })
})
