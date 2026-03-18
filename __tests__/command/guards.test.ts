import { describe, it, expect, vi } from 'vitest'
import { guards } from '../../src/command/guards'

describe('Built-in Guards', () => {
  it('onlyGroup should block private chats', async () => {
    const mw = guards.onlyGroup()
    const next = vi.fn()
    const send = vi.fn()
    const ctx: any = { flags: { isGroup: false }, actions: { send } }

    await mw(ctx, next)
    expect(send).toHaveBeenCalledWith(expect.stringContaining('only be used in groups'))
    expect(next).not.toHaveBeenCalled()
  })

  it('cooldown should block rapid calls', async () => {
    const mw = guards.cooldown(1) // 1s
    const next = vi.fn()
    const send = vi.fn()
    const ctx: any = { sender: { id: 'u1' }, command: 'ping', actions: { send } }

    await mw(ctx, next) // first call
    expect(next).toHaveBeenCalledTimes(1)

    await mw(ctx, next) // second call (too fast)
    expect(send).toHaveBeenCalledWith(expect.stringContaining('Cooldown'))
    expect(next).toHaveBeenCalledTimes(1)
  })
})
