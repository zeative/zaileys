import { afterEach, describe, expect, it, vi } from 'vitest'
import { configureMediaLogger, mediaWarn } from '../../src/media/ffmpeg/log.js'

afterEach(() => configureMediaLogger(undefined))

describe('media warnings', () => {
  it('go to the configured logger and never to the console', () => {
    const warn = vi.fn()
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    configureMediaLogger({ warn })
    mediaWarn({ durationSeconds: 10 }, 'could not probe')
    expect(warn).toHaveBeenCalledWith({ durationSeconds: 10 }, 'could not probe')
    expect(consoleWarn).not.toHaveBeenCalled()
    consoleWarn.mockRestore()
  })

  it('are dropped when no logger is configured', () => {
    expect(() => mediaWarn({}, 'nobody listening')).not.toThrow()
  })
})
