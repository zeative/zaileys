import type { WAMessage } from 'baileys'
import { afterEach, describe, expect, it, vi } from 'vitest'

const downloadMediaMessage = vi.fn()

vi.mock('baileys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('baileys')>()
  return { ...actual, downloadMediaMessage }
})

const { createDownloadFn } = await import('../../../src/events/decoders/_media-download.js')

const imageMsg = (): WAMessage =>
  ({
    key: { remoteJid: '111@s.whatsapp.net', id: 'AAA' },
    message: { imageMessage: { mimetype: 'image/jpeg' } },
  }) as unknown as WAMessage

afterEach(() => {
  downloadMediaMessage.mockReset()
})

describe('createDownloadFn', () => {
  it('returns a function without invoking the baileys download eagerly', () => {
    const fn = createDownloadFn(imageMsg(), 'image')
    expect(typeof fn).toBe('function')
    expect(downloadMediaMessage).not.toHaveBeenCalled()
  })

  it('resolves buffer, mime, and byte size on call', async () => {
    const buffer = Buffer.from('hello world')
    downloadMediaMessage.mockResolvedValueOnce(buffer)
    const fn = createDownloadFn(imageMsg(), 'image')
    const result = await fn()
    expect(result.buffer).toBe(buffer)
    expect(result.mime).toBe('image/jpeg')
    expect(result.size).toBe(buffer.byteLength)
  })

  it('lazily imports baileys only on first call', async () => {
    downloadMediaMessage.mockResolvedValueOnce(Buffer.alloc(4))
    const fn = createDownloadFn(imageMsg(), 'image')
    expect(downloadMediaMessage).not.toHaveBeenCalled()
    await fn()
    expect(downloadMediaMessage).toHaveBeenCalledTimes(1)
    expect(downloadMediaMessage).toHaveBeenCalledWith(expect.anything(), 'buffer', {})
  })

  it('falls back to octet-stream when mimetype is absent', async () => {
    downloadMediaMessage.mockResolvedValueOnce(Buffer.alloc(2))
    const msg = {
      key: { remoteJid: '111@s.whatsapp.net', id: 'B' },
      message: { audioMessage: {} },
    } as unknown as WAMessage
    const fn = createDownloadFn(msg, 'audio')
    const result = await fn()
    expect(result.mime).toBe('application/octet-stream')
  })

  it('rethrows and warns when the download fails', async () => {
    const boom = new Error('network down')
    downloadMediaMessage.mockRejectedValueOnce(boom)
    const warn = vi.fn()
    const fn = createDownloadFn(imageMsg(), 'image', { warn })
    await expect(fn()).rejects.toThrow('network down')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('resolves mime per media kind for video and document', async () => {
    downloadMediaMessage.mockResolvedValue(Buffer.alloc(1))
    const video = {
      key: { remoteJid: '1@s.whatsapp.net', id: 'V' },
      message: { videoMessage: { mimetype: 'video/mp4' } },
    } as unknown as WAMessage
    const doc = {
      key: { remoteJid: '1@s.whatsapp.net', id: 'D' },
      message: { documentMessage: { mimetype: 'application/pdf' } },
    } as unknown as WAMessage
    expect((await createDownloadFn(video, 'video')()).mime).toBe('video/mp4')
    expect((await createDownloadFn(doc, 'document')()).mime).toBe('application/pdf')
  })
})
