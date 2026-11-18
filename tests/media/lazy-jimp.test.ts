import { describe, expect, it, vi } from 'vitest'

const jimpLoaded = vi.fn()

vi.mock('jimp', async (importOriginal) => {
  jimpLoaded()
  return importOriginal()
})

describe('jimp loading', () => {
  it('is not imported when zaileys is imported', async () => {
    await import('../../src/index.js')
    expect(jimpLoaded).not.toHaveBeenCalled()
  })
})
