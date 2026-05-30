import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MessageBuilder } from '../../src/automation/../builder/builder.js'
import { runBroadcast, type BroadcastDeps } from '../../src/automation/broadcast.js'
import { RateLimiter } from '../../src/automation/rate-limiter.js'

type SendOutcome = { ok: true } | { ok: false; error: Error }

const thenable = (outcome: SendOutcome) =>
  ({
    then(onResolved: (key: unknown) => unknown, onRejected?: (err: unknown) => unknown) {
      return outcome.ok
        ? Promise.resolve({ id: 'KEY' }).then(onResolved, onRejected)
        : Promise.reject(outcome.error).then(onResolved, onRejected)
    },
  }) as unknown as MessageBuilder<'content-set'>

const initBuilder = () => ({}) as unknown as MessageBuilder<'init'>

const flush = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
  }
}

const sendToFor = (outcomeFor: (jid: string, call: number) => SendOutcome) => {
  const calls: string[] = []
  const counts = new Map<string, number>()
  const sendTo: BroadcastDeps['sendTo'] = (jid) => {
    calls.push(jid)
    return initBuilder()
  }
  const build = (b: MessageBuilder<'init'>): MessageBuilder<'content-set'> => {
    void b
    const jid = calls[calls.length - 1]!
    const n = (counts.get(jid) ?? 0) + 1
    counts.set(jid, n)
    return thenable(outcomeFor(jid, n))
  }
  return { sendTo, build, calls, counts }
}

const allOk = (): SendOutcome => ({ ok: true })

describe('runBroadcast basic outcomes', () => {
  it('returns empty result for empty jids without invoking sendTo', async () => {
    const { sendTo, build, calls } = sendToFor(allOk)
    const result = await runBroadcast([], build, { sendTo })
    expect(result).toEqual({ sent: [], failed: [] })
    expect(calls).toHaveLength(0)
  })

  it('sends to every jid on the happy path', async () => {
    const jids = ['a@s.whatsapp.net', 'b@s.whatsapp.net', 'c@s.whatsapp.net']
    const { sendTo, build } = sendToFor(allOk)
    const result = await runBroadcast(jids, build, { sendTo })
    expect(result.sent).toEqual(jids)
    expect(result.failed).toEqual([])
  })

  it('upholds the invariant sent + failed === total', async () => {
    const jids = Array.from({ length: 7 }, (_, i) => `j${i}@s.whatsapp.net`)
    const { sendTo, build } = sendToFor((jid) =>
      jid === 'j3@s.whatsapp.net' ? { ok: false, error: new Error('x') } : { ok: true },
    )
    const result = await runBroadcast(jids, build, { sendTo })
    expect(result.sent.length + result.failed.length).toBe(jids.length)
  })

  it('calls sendTo once per jid with a fresh builder', async () => {
    const jids = ['a@s.whatsapp.net', 'b@s.whatsapp.net']
    const { sendTo, build, calls } = sendToFor(allOk)
    await runBroadcast(jids, build, { sendTo })
    expect(calls).toEqual(jids)
  })

  it('preserves jid order in the sent array', async () => {
    const jids = ['z@s.whatsapp.net', 'a@s.whatsapp.net', 'm@s.whatsapp.net']
    const { sendTo, build } = sendToFor(allOk)
    const result = await runBroadcast(jids, build, { sendTo })
    expect(result.sent).toEqual(jids)
  })
})

describe('runBroadcast failure isolation', () => {
  it('continues past a failing recipient (1 of 5 fails)', async () => {
    const jids = Array.from({ length: 5 }, (_, i) => `j${i}@s.whatsapp.net`)
    const { sendTo, build } = sendToFor((jid) =>
      jid === 'j2@s.whatsapp.net' ? { ok: false, error: new Error('boom') } : { ok: true },
    )
    const result = await runBroadcast(jids, build, { sendTo })
    expect(result.sent).toEqual(['j0@s.whatsapp.net', 'j1@s.whatsapp.net', 'j3@s.whatsapp.net', 'j4@s.whatsapp.net'])
    expect(result.failed).toEqual([{ jid: 'j2@s.whatsapp.net', error: expect.any(Error) }])
  })

  it('records the exact error per failed recipient', async () => {
    const err = new Error('specific-cause')
    const { sendTo, build } = sendToFor(() => ({ ok: false, error: err }))
    const result = await runBroadcast(['a@s.whatsapp.net'], build, { sendTo })
    expect(result.failed[0]!.error).toBe(err)
  })

  it('does not throw when all recipients fail', async () => {
    const jids = ['a@s.whatsapp.net', 'b@s.whatsapp.net']
    const { sendTo, build } = sendToFor(() => ({ ok: false, error: new Error('all') }))
    const result = await runBroadcast(jids, build, { sendTo })
    expect(result.sent).toEqual([])
    expect(result.failed.map((f) => f.jid)).toEqual(jids)
  })

  it('normalises a non-Error rejection into an Error', async () => {
    const { sendTo, build } = sendToFor(() => ({ ok: false, error: 'string-reason' as unknown as Error }))
    const result = await runBroadcast(['a@s.whatsapp.net'], build, { sendTo })
    expect(result.failed[0]!.error).toBeInstanceOf(Error)
    expect(result.failed[0]!.error.message).toBe('string-reason')
  })
})

describe('runBroadcast progress callback', () => {
  it('fires onProgress once per recipient', async () => {
    const jids = Array.from({ length: 4 }, (_, i) => `j${i}@s.whatsapp.net`)
    const { sendTo, build } = sendToFor(allOk)
    const calls: Array<[number, number, string, boolean]> = []
    await runBroadcast(jids, build, { sendTo }, { onProgress: (d, t, j, ok) => calls.push([d, t, j, ok]) })
    expect(calls).toHaveLength(4)
  })

  it('reports an increasing done counter and constant total', async () => {
    const jids = Array.from({ length: 3 }, (_, i) => `j${i}@s.whatsapp.net`)
    const { sendTo, build } = sendToFor(allOk)
    const calls: Array<[number, number, string, boolean]> = []
    await runBroadcast(jids, build, { sendTo }, { onProgress: (d, t, j, ok) => calls.push([d, t, j, ok]) })
    expect(calls.map((c) => c[0])).toEqual([1, 2, 3])
    expect(calls.every((c) => c[1] === 3)).toBe(true)
  })

  it('passes the correct ok flag for mixed outcomes', async () => {
    const jids = ['a@s.whatsapp.net', 'b@s.whatsapp.net', 'c@s.whatsapp.net']
    const { sendTo, build } = sendToFor((jid) =>
      jid === 'b@s.whatsapp.net' ? { ok: false, error: new Error('x') } : { ok: true },
    )
    const flags: boolean[] = []
    await runBroadcast(jids, build, { sendTo }, { onProgress: (_d, _t, _j, ok) => flags.push(ok) })
    expect(flags).toEqual([true, false, true])
  })

  it('passes the jid that just resolved', async () => {
    const jids = ['a@s.whatsapp.net', 'b@s.whatsapp.net']
    const { sendTo, build } = sendToFor(allOk)
    const seen: string[] = []
    await runBroadcast(jids, build, { sendTo }, { onProgress: (_d, _t, jid) => seen.push(jid) })
    expect(seen).toEqual(jids)
  })

  it('tolerates a missing onProgress callback', async () => {
    const { sendTo, build } = sendToFor(allOk)
    await expect(runBroadcast(['a@s.whatsapp.net'], build, { sendTo })).resolves.toBeDefined()
  })
})

describe('runBroadcast retry integration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retries a transient failure and records it as sent (maxRetries=2)', async () => {
    const { sendTo, build } = sendToFor((_jid, call) => (call < 3 ? { ok: false, error: new Error('t') } : { ok: true }))
    const promise = runBroadcast(
      ['a@s.whatsapp.net'],
      build,
      { sendTo },
      { retry: { maxRetries: 2, backoffMs: () => 0 } },
    )
    await vi.runAllTimersAsync()
    const result = await promise
    expect(result.sent).toEqual(['a@s.whatsapp.net'])
    expect(result.failed).toEqual([])
  })

  it('records as failed after exhausting retries', async () => {
    const { sendTo, build, counts } = sendToFor(() => ({ ok: false, error: new Error('always') }))
    const promise = runBroadcast(
      ['a@s.whatsapp.net'],
      build,
      { sendTo },
      { retry: { maxRetries: 2, backoffMs: () => 0 } },
    )
    await vi.runAllTimersAsync()
    const result = await promise
    expect(result.failed).toHaveLength(1)
    expect(counts.get('a@s.whatsapp.net')).toBe(3)
  })

  it('performs exactly one attempt with no retry policy', async () => {
    vi.useRealTimers()
    const { sendTo, build, counts } = sendToFor(() => ({ ok: false, error: new Error('once') }))
    const result = await runBroadcast(['a@s.whatsapp.net'], build, { sendTo })
    expect(result.failed).toHaveLength(1)
    expect(counts.get('a@s.whatsapp.net')).toBe(1)
  })
})

describe('runBroadcast rate-limit pacing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('paces 10 jids at 5/sec rather than firing instantly', async () => {
    const jids = Array.from({ length: 10 }, (_, i) => `j${i}@s.whatsapp.net`)
    let nowMs = 0
    const { sendTo, build } = sendToFor(allOk)
    const sendTimes: number[] = []
    const wrappedBuild = (b: MessageBuilder<'init'>): MessageBuilder<'content-set'> => {
      sendTimes.push(nowMs)
      return build(b)
    }
    const limiter = new RateLimiter(
      { perSec: 5 },
      {
        now: () => nowMs,
        sleep: async (ms) => {
          nowMs += ms
        },
      },
    )
    const promise = runBroadcast(jids, wrappedBuild, { sendTo, limiter })
    await vi.runAllTimersAsync()
    const result = await promise
    expect(result.sent).toHaveLength(10)
    expect(Math.max(...sendTimes)).toBeGreaterThan(0)
  })

  it('builds a limiter from rateLimitPerSec when none injected', async () => {
    const jids = Array.from({ length: 6 }, (_, i) => `j${i}@s.whatsapp.net`)
    let nowMs = 0
    const { sendTo, build } = sendToFor(allOk)
    const promise = runBroadcast(
      jids,
      build,
      {
        sendTo,
        now: () => nowMs,
        sleep: async (ms) => {
          nowMs += ms
        },
      },
      { rateLimitPerSec: 5 },
    )
    await vi.runAllTimersAsync()
    const result = await promise
    expect(result.sent).toHaveLength(6)
    expect(nowMs).toBeGreaterThan(0)
  })

  it('defaults to 5/sec when rateLimitPerSec is omitted', async () => {
    const jids = Array.from({ length: 6 }, (_, i) => `j${i}@s.whatsapp.net`)
    let nowMs = 0
    const { sendTo, build } = sendToFor(allOk)
    const promise = runBroadcast(jids, build, {
      sendTo,
      now: () => nowMs,
      sleep: async (ms) => {
        nowMs += ms
      },
    })
    await vi.runAllTimersAsync()
    const result = await promise
    expect(result.sent).toHaveLength(6)
    expect(nowMs).toBeGreaterThan(0)
  })
})

describe('runBroadcast scale smoke', () => {
  it('handles 100 jids without leaking or dropping recipients', async () => {
    const jids = Array.from({ length: 100 }, (_, i) => `j${i}@s.whatsapp.net`)
    const { sendTo, build } = sendToFor((jid) =>
      jid.endsWith('7@s.whatsapp.net') ? { ok: false, error: new Error('flaky') } : { ok: true },
    )
    let progressCount = 0
    const result = await runBroadcast(
      jids,
      build,
      { sendTo, now: () => 0, sleep: async () => undefined },
      { rateLimitPerSec: 1000, onProgress: () => (progressCount += 1) },
    )
    expect(result.sent.length + result.failed.length).toBe(100)
    expect(progressCount).toBe(100)
    expect(result.failed.length).toBe(jids.filter((j) => j.endsWith('7@s.whatsapp.net')).length)
  })

  it('does not throw on 100 jids where every send fails', async () => {
    const jids = Array.from({ length: 100 }, (_, i) => `j${i}@s.whatsapp.net`)
    const { sendTo, build } = sendToFor(() => ({ ok: false, error: new Error('down') }))
    const result = await runBroadcast(jids, build, { sendTo, now: () => 0, sleep: async () => undefined })
    expect(result.sent).toHaveLength(0)
    expect(result.failed).toHaveLength(100)
  })
})
