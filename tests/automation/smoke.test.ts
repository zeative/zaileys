import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import * as automation from '../../src/automation/index.js'
import {
  PresenceModule,
  RateLimiter,
  Scheduler,
  TaskQueue,
  ZaileysAutomationError,
  runBroadcast,
  type BroadcastOptions,
  type BroadcastResult,
  type ScheduledContentSnapshot,
  type WAPresence,
} from '../../src/automation/index.js'

describe('automation barrel surface', () => {
  it('re-exports RateLimiter', () => {
    expect(typeof automation.RateLimiter).toBe('function')
  })

  it('re-exports TaskQueue', () => {
    expect(typeof automation.TaskQueue).toBe('function')
  })

  it('re-exports runBroadcast', () => {
    expect(typeof automation.runBroadcast).toBe('function')
  })

  it('re-exports PresenceModule', () => {
    expect(typeof automation.PresenceModule).toBe('function')
  })

  it('re-exports Scheduler', () => {
    expect(typeof automation.Scheduler).toBe('function')
  })

  it('re-exports ZaileysAutomationError', () => {
    expect(typeof automation.ZaileysAutomationError).toBe('function')
    expect(new ZaileysAutomationError('NOT_CONNECTED', 'x')).toBeInstanceOf(Error)
  })

  it('exposes BroadcastResult + BroadcastOptions types', () => {
    expectTypeOf<BroadcastResult>().toHaveProperty('sent')
    expectTypeOf<BroadcastResult>().toHaveProperty('failed')
    expectTypeOf<BroadcastOptions>().toHaveProperty('rateLimitPerSec')
  })

  it('exposes WAPresence + ScheduledContentSnapshot types', () => {
    const p: WAPresence = 'available'
    expect(p).toBe('available')
    expectTypeOf<ScheduledContentSnapshot>().toHaveProperty('recipient')
  })
})

describe('automation smoke roundtrip', () => {
  it('RateLimiter.acquire resolves immediately while tokens remain', async () => {
    const limiter = new RateLimiter({ perSec: 5 })
    await expect(limiter.acquire('a@s.whatsapp.net')).resolves.toBeUndefined()
  })

  it('RateLimiter rejects an invalid perSec at construction', () => {
    expect(() => new RateLimiter({ perSec: 0 })).toThrow(ZaileysAutomationError)
  })

  it('TaskQueue.add runs the task and resolves with its value', async () => {
    const queue = new TaskQueue({ concurrency: 1 })
    const value = await queue.add(async () => 42)
    expect(value).toBe(42)
  })

  it('PresenceModule.online forwards available to the socket', async () => {
    const sendPresenceUpdate = vi.fn(async () => undefined)
    const presence = new PresenceModule(() => ({ sendPresenceUpdate }))
    await presence.online()
    expect(sendPresenceUpdate).toHaveBeenCalledWith('available')
  })

  it('PresenceModule throws NOT_CONNECTED without a socket', async () => {
    const presence = new PresenceModule(() => undefined)
    await expect(presence.online()).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
  })

  it('runBroadcast fans out to every recipient via sendTo', async () => {
    const sent: string[] = []
    const result = await runBroadcast(
      ['a@s.whatsapp.net', 'b@s.whatsapp.net'],
      (b) => b.text('hi'),
      {
        sendTo: (jid) => {
          sent.push(jid)
          return { text: () => ({ then: (r: (v: unknown) => void) => r({ key: { id: jid } }) }) } as never
        },
      },
    )
    expect(result.sent).toHaveLength(2)
    expect(sent).toEqual(['a@s.whatsapp.net', 'b@s.whatsapp.net'])
  })
})
