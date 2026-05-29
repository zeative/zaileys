import { describe, expect, it, vi } from 'vitest'
import { printQrToTerminal, renderQrInTerminal } from '../../src/connection/qr-terminal.js'

const SAMPLE_QR = '2@abc123,xyz789=='
const LONG_QR = 'A'.repeat(220)

describe('renderQrInTerminal', () => {
  it('resolves to a non-empty string for a valid QR payload', async () => {
    const output = await renderQrInTerminal(SAMPLE_QR)
    expect(typeof output).toBe('string')
    expect(output.length).toBeGreaterThan(0)
  })

  it('rejects on empty string with helpful message', async () => {
    await expect(renderQrInTerminal('')).rejects.toThrow('qr string is required')
  })

  it('rejects on whitespace-only string', async () => {
    await expect(renderQrInTerminal('   \n\t')).rejects.toThrow('qr string is required')
  })

  it('rejects when value coerces to falsy (null cast)', async () => {
    await expect(renderQrInTerminal(null as unknown as string)).rejects.toThrow('qr string is required')
  })

  it('produces deterministic output for same input', async () => {
    const a = await renderQrInTerminal(SAMPLE_QR)
    const b = await renderQrInTerminal(SAMPLE_QR)
    expect(a).toBe(b)
  })

  it('produces different output for different inputs', async () => {
    const a = await renderQrInTerminal(SAMPLE_QR)
    const b = await renderQrInTerminal('different-payload-zzz')
    expect(a).not.toBe(b)
  })

  it('uses small format (line count under 50)', async () => {
    const output = await renderQrInTerminal(SAMPLE_QR)
    const lines = output.split('\n')
    expect(lines.length).toBeLessThan(50)
  })

  it('handles long QR strings (200+ chars) without crashing', async () => {
    const output = await renderQrInTerminal(LONG_QR)
    expect(output.length).toBeGreaterThan(0)
  })

  it('returns a Promise (forward-compat with async qrcode renderers)', () => {
    const promise = renderQrInTerminal(SAMPLE_QR)
    expect(promise).toBeInstanceOf(Promise)
  })
})

describe('printQrToTerminal', () => {
  it('calls provided write fn with rendered output + trailing newline', async () => {
    const write = vi.fn()
    await printQrToTerminal(SAMPLE_QR, write)
    expect(write).toHaveBeenCalledTimes(1)
    const arg = write.mock.calls[0]![0] as string
    expect(arg.endsWith('\n')).toBe(true)
    expect(arg.length).toBeGreaterThan(1)
  })

  it('rejects when QR is empty', async () => {
    const write = vi.fn()
    await expect(printQrToTerminal('', write)).rejects.toThrow('qr string is required')
    expect(write).not.toHaveBeenCalled()
  })

  it('defaults to process.stdout.write when write fn omitted', async () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    try {
      await printQrToTerminal(SAMPLE_QR)
      expect(spy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})
