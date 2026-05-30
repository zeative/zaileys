import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { spawnMock, fsMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  fsMock: {
    unlink: vi.fn(async () => undefined),
    readFile: vi.fn(async () => Buffer.from('data')),
    writeFile: vi.fn(async () => undefined),
    stat: vi.fn(),
  },
}))

vi.mock('child_process', () => ({ spawn: (...args: unknown[]) => spawnMock(...args) }))
vi.mock('fs/promises', () => ({ default: fsMock, ...fsMock }))

import {
  BufferConverter,
  FFmpegProcessor,
  FileManager,
  MimeValidator,
  initializeFFmpeg,
} from '../../src/media/ffmpeg/core.js'

class FakeChild extends EventEmitter {
  stdout = new EventEmitter()
}

const makeChild = () => {
  const child = new FakeChild()
  spawnMock.mockReturnValueOnce(child)
  return child
}

beforeEach(() => {
  spawnMock.mockReset()
  fsMock.unlink.mockClear()
  fsMock.readFile.mockClear()
  fsMock.writeFile.mockClear()
  fsMock.stat.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('FFmpegProcessor.process', () => {
  it('CR1: builds -y -i input <options> output and resolves on exit code 0', async () => {
    const child = makeChild()
    const onEnd = vi.fn(async () => undefined)
    const promise = FFmpegProcessor.process({
      input: '/in.wav',
      output: '/out.ogg',
      options: ['-c:a', 'libopus'],
      onEnd,
      onError: vi.fn(async () => undefined),
    })
    child.emit('close', 0)
    await promise
    expect(onEnd).toHaveBeenCalledOnce()
    const [, args] = spawnMock.mock.calls[0]!
    expect(args).toEqual(['-y', '-i', '/in.wav', '-c:a', 'libopus', '/out.ogg'])
  })

  it('CR2: rejects and invokes onError on a non-zero exit code', async () => {
    const child = makeChild()
    const onError = vi.fn(async () => undefined)
    const promise = FFmpegProcessor.process({
      input: '/in',
      output: '/out',
      options: [],
      onEnd: vi.fn(async () => undefined),
      onError,
    })
    child.emit('close', 1)
    await expect(promise).rejects.toThrow('FFmpeg exited with code 1')
    expect(onError).toHaveBeenCalledOnce()
  })

  it('CR3: rejects when the child emits an error event', async () => {
    const child = makeChild()
    const onError = vi.fn(async () => undefined)
    const promise = FFmpegProcessor.process({
      input: '/in',
      output: '/out',
      options: [],
      onEnd: vi.fn(async () => undefined),
      onError,
    })
    child.emit('error', new Error('spawn ENOENT'))
    await expect(promise).rejects.toThrow('spawn ENOENT')
    expect(onError).toHaveBeenCalledOnce()
  })

  it('CR4: propagates an error thrown by onEnd', async () => {
    const child = makeChild()
    const promise = FFmpegProcessor.process({
      input: '/in',
      output: '/out',
      options: [],
      onEnd: vi.fn(async () => {
        throw new Error('read failed')
      }),
      onError: vi.fn(async () => undefined),
    })
    child.emit('close', 0)
    await expect(promise).rejects.toThrow('read failed')
  })
})

describe('FFmpegProcessor.getDuration', () => {
  it('CR5: parses ffprobe stdout into a float', async () => {
    const child = makeChild()
    const promise = FFmpegProcessor.getDuration('/file.mp4')
    child.stdout.emit('data', '12.5\n')
    child.emit('close', 0)
    expect(await promise).toBe(12.5)
  })

  it('CR6: resolves 0 when ffprobe emits no parseable duration', async () => {
    const child = makeChild()
    const promise = FFmpegProcessor.getDuration('/file.mp4')
    child.emit('close', 0)
    expect(await promise).toBe(0)
  })

  it('CR7: rejects on a non-zero ffprobe exit code', async () => {
    const child = makeChild()
    const promise = FFmpegProcessor.getDuration('/file.mp4')
    child.emit('close', 2)
    await expect(promise).rejects.toThrow('ffprobe exited with code 2')
  })
})

describe('BufferConverter.toBuffer', () => {
  it('CR8: returns Buffer input unchanged', async () => {
    const buf = Buffer.from('x')
    expect(await BufferConverter.toBuffer(buf)).toBe(buf)
  })

  it('CR9: wraps an ArrayBuffer', async () => {
    const ab = new Uint8Array([1, 2, 3]).buffer
    const out = await BufferConverter.toBuffer(ab)
    expect(Buffer.isBuffer(out)).toBe(true)
    expect([...out]).toEqual([1, 2, 3])
  })

  it('CR10: reads a string path that resolves to an existing file', async () => {
    fsMock.stat.mockResolvedValueOnce({ isFile: () => true })
    fsMock.readFile.mockResolvedValueOnce(Buffer.from('file-bytes'))
    const out = await BufferConverter.toBuffer('/some/file.bin')
    expect(out.toString()).toBe('file-bytes')
  })

  it('CR11: decodes a non-path string as base64', async () => {
    fsMock.stat.mockRejectedValueOnce(new Error('ENOENT'))
    const out = await BufferConverter.toBuffer(Buffer.from('hello').toString('base64'))
    expect(out.toString()).toBe('hello')
  })

  it('CR12: throws on an invalid input type', async () => {
    await expect(BufferConverter.toBuffer(123 as never)).rejects.toThrow('Invalid input type')
  })
})

describe('MimeValidator', () => {
  it('CR13: validate passes for a matching prefix', () => {
    expect(() => MimeValidator.validate({ mime: 'audio/ogg' }, 'audio/')).not.toThrow()
  })

  it('CR14: validate throws for a mismatched prefix', () => {
    expect(() => MimeValidator.validate({ mime: 'image/png' }, 'audio/')).toThrow('expected audio/*')
  })

  it('CR15: validate throws "unknown" when fileType is null', () => {
    expect(() => MimeValidator.validate(null, 'video/')).toThrow('got unknown')
  })

  it('CR16: isMedia is true for image and video, false otherwise', () => {
    expect(MimeValidator.isMedia('image/png')).toBe(true)
    expect(MimeValidator.isMedia('video/mp4')).toBe(true)
    expect(MimeValidator.isMedia('audio/ogg')).toBe(false)
  })

  it('CR17: isAnimated is true for gif and video, false for static image', () => {
    expect(MimeValidator.isAnimated('image/gif')).toBe(true)
    expect(MimeValidator.isAnimated('video/mp4')).toBe(true)
    expect(MimeValidator.isAnimated('image/png')).toBe(false)
  })
})

describe('FileManager', () => {
  it('CR18: createTempPath embeds prefix and extension', () => {
    const p = FileManager.createTempPath('audio_in', 'ogg')
    expect(p).toMatch(/audio_in_.*\.ogg$/)
  })

  it('CR19: cleanup unlinks every file and swallows failures', async () => {
    fsMock.unlink.mockRejectedValueOnce(new Error('missing'))
    await expect(FileManager.cleanup(['/a', '/b'])).resolves.toBeUndefined()
    expect(fsMock.unlink).toHaveBeenCalledTimes(2)
  })

  it('CR20: safeReadFile rethrows as a descriptive error', async () => {
    fsMock.readFile.mockRejectedValueOnce(new Error('boom'))
    await expect(FileManager.safeReadFile('/x')).rejects.toThrow('Failed to read file: /x')
  })

  it('CR21: safeWriteFile rethrows as a descriptive error', async () => {
    fsMock.writeFile.mockRejectedValueOnce(new Error('boom'))
    await expect(FileManager.safeWriteFile('/x', Buffer.from('a'))).rejects.toThrow(
      'Failed to write file: /x',
    )
  })
})

describe('initializeFFmpeg', () => {
  it('CR22: returns early when disabled', async () => {
    await expect(initializeFFmpeg(true)).resolves.toBeUndefined()
  })

  it('CR23: swallows installer import failures', async () => {
    await expect(initializeFFmpeg(false)).resolves.toBeUndefined()
  })
})
