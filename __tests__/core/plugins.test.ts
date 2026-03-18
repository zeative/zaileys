import { describe, it, expect, vi } from 'vitest'
import { Zaileys } from '../../src/core/zaileys'
import { definePlugin } from '../../src/core/plugins'

describe('Plugin API', () => {
  const mockSocket = { ev: { on: vi.fn() } }

  it('should register and execute plugins', () => {
    const bot = new Zaileys(mockSocket)
    const spy = vi.fn()
    const plugin = definePlugin((b) => {
      spy(b)
    })

    bot.use(plugin)
    expect(spy).toHaveBeenCalledWith(bot)
  })
})
