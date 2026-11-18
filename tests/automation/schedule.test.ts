import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageBuilder, type BuilderSocketLike } from '../../src/builder/index.js'
import {
  Scheduler,
  ZaileysAutomationError,
  type ScheduledContentSnapshot,
  type SchedulerTimer,
} from '../../src/automation/index.js'
import type { MessageStore, ScheduledJobRecord } from '../../src/store/types.js'

const JID = 'a@s.whatsapp.net'

const captureSocket = (): BuilderSocketLike => ({
  sendMessage: vi.fn(async (jid: string) => ({ key: { remoteJid: jid, id: 'cap', fromMe: true } })),
})

const buildFor = (jid: string): ((b: MessageBuilder<'init'>) => MessageBuilder<'content-set'>) => {
  return (b) => b.to(jid).text('later')
}

type SchedDeps = {
  sendSnapshot: ReturnType<typeof vi.fn>
  store: Partial<MessageStore>
}

const makeScheduler = (over: Partial<SchedDeps> = {}): { scheduler: Scheduler } & SchedDeps => {
  const sendSnapshot = over.sendSnapshot ?? vi.fn(async (_snap: ScheduledContentSnapshot) => undefined)
  const store = over.store ?? {}
  const scheduler = new Scheduler({
    store: store as MessageStore,
    sendSnapshot: sendSnapshot as never,
    now: () => Date.now(),
  })
  return { scheduler, sendSnapshot, store }
}

describe('Scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('scheduleAt returns an id and cancel handle', async () => {
    const { scheduler } = makeScheduler()
    const handle = await scheduler.scheduleAt(new Date(1000), buildFor(JID))
    expect(typeof handle.id).toBe('string')
    expect(typeof handle.cancel).toBe('function')
  })

  it('fires after the delay with the eager snapshot', async () => {
    const { scheduler, sendSnapshot } = makeScheduler()
    await scheduler.scheduleAt(new Date(1000), buildFor(JID))
    expect(sendSnapshot).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(sendSnapshot).toHaveBeenCalledTimes(1)
  })

  it('awaits acquire() before dispatching a due job', async () => {
    const sendSnapshot = vi.fn(async (_snap: ScheduledContentSnapshot) => undefined)
    const acquire = vi.fn(async () => undefined)
    const scheduler = new Scheduler({
      store: {} as MessageStore,
      sendSnapshot: sendSnapshot as never,
      now: () => Date.now(),
      acquire,
    })
    await scheduler.scheduleAt(new Date(1000), buildFor(JID))
    await vi.advanceTimersByTimeAsync(1000)
    expect(acquire).toHaveBeenCalledTimes(1)
    expect(sendSnapshot).toHaveBeenCalledTimes(1)
  })

  it('a rejecting acquire() suppresses the send (job is skipped, not crashed)', async () => {
    const sendSnapshot = vi.fn(async (_snap: ScheduledContentSnapshot) => undefined)
    const acquire = vi.fn(async () => Promise.reject(new Error('limiter down')))
    const scheduler = new Scheduler({
      store: {} as MessageStore,
      sendSnapshot: sendSnapshot as never,
      now: () => Date.now(),
      acquire,
    })
    await scheduler.scheduleAt(new Date(1000), buildFor(JID))
    await vi.advanceTimersByTimeAsync(1000)
    expect(sendSnapshot).not.toHaveBeenCalled()
  })

  it('snapshot carries the resolved recipient', async () => {
    const { scheduler, sendSnapshot } = makeScheduler()
    await scheduler.scheduleAt(new Date(1000), buildFor(JID))
    await vi.advanceTimersByTimeAsync(1000)
    expect(sendSnapshot.mock.calls[0]?.[0]).toMatchObject({ recipient: JID })
  })

  it('snapshot carries the resolved text content', async () => {
    const { scheduler, sendSnapshot } = makeScheduler()
    await scheduler.scheduleAt(new Date(1000), buildFor(JID))
    await vi.advanceTimersByTimeAsync(1000)
    const snap = sendSnapshot.mock.calls[0]?.[0] as ScheduledContentSnapshot
    expect(snap.content).toMatchObject({ text: 'later' })
  })

  it('builder is evaluated eagerly (once) at schedule time', async () => {
    const build = vi.fn((b: MessageBuilder<'init'>) => b.to(JID).text('hi'))
    const { scheduler } = makeScheduler()
    await scheduler.scheduleAt(new Date(1000), build)
    expect(build).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(build).toHaveBeenCalledTimes(1)
  })

  it('cancel before fire prevents sendSnapshot', async () => {
    const { scheduler, sendSnapshot } = makeScheduler()
    const handle = await scheduler.scheduleAt(new Date(1000), buildFor(JID))
    handle.cancel()
    await vi.advanceTimersByTimeAsync(1000)
    expect(sendSnapshot).not.toHaveBeenCalled()
  })

  it('past date fires immediately', async () => {
    vi.setSystemTime(5000)
    const { scheduler, sendSnapshot } = makeScheduler()
    await scheduler.scheduleAt(new Date(1000), buildFor(JID))
    await vi.advanceTimersByTimeAsync(0)
    expect(sendSnapshot).toHaveBeenCalledTimes(1)
  })

  it('invalid date throws SCHEDULE_INVALID', async () => {
    const { scheduler } = makeScheduler()
    await expect(scheduler.scheduleAt(new Date(NaN), buildFor(JID))).rejects.toMatchObject({
      code: 'SCHEDULE_INVALID',
    })
  })

  it('invalid date throws a ZaileysAutomationError', async () => {
    const { scheduler } = makeScheduler()
    await expect(scheduler.scheduleAt(new Date(NaN), buildFor(JID))).rejects.toBeInstanceOf(
      ZaileysAutomationError,
    )
  })

  it('persists the record via store.saveScheduledJob when available', async () => {
    const saveScheduledJob = vi.fn(async (_j: ScheduledJobRecord) => undefined)
    const { scheduler } = makeScheduler({ store: { saveScheduledJob } })
    await scheduler.scheduleAt(new Date(1000), buildFor(JID))
    expect(saveScheduledJob).toHaveBeenCalledTimes(1)
    const rec = saveScheduledJob.mock.calls[0]?.[0] as ScheduledJobRecord
    expect(rec.recipient).toBe(JID)
    expect(rec.fireAt).toBe(1000)
    expect(rec.payload).toMatchObject({ content: { text: 'later' } })
  })

  it('deletes the record after firing', async () => {
    const saveScheduledJob = vi.fn(async () => undefined)
    const deleteScheduledJob = vi.fn(async (_id: string) => undefined)
    const { scheduler } = makeScheduler({ store: { saveScheduledJob, deleteScheduledJob } })
    const handle = await scheduler.scheduleAt(new Date(1000), buildFor(JID))
    await vi.advanceTimersByTimeAsync(1000)
    expect(deleteScheduledJob).toHaveBeenCalledWith(handle.id)
  })

  it('retains the record when the send fails at fire time', async () => {
    const saveScheduledJob = vi.fn(async () => undefined)
    const deleteScheduledJob = vi.fn(async (_id: string) => undefined)
    const sendSnapshot = vi.fn(async () => {
      throw new Error('client not connected')
    })
    const { scheduler } = makeScheduler({
      store: { saveScheduledJob, deleteScheduledJob },
      sendSnapshot,
    })
    await scheduler.scheduleAt(new Date(1000), buildFor(JID))
    await vi.advanceTimersByTimeAsync(1000)
    expect(sendSnapshot).toHaveBeenCalledTimes(1)
    expect(deleteScheduledJob).not.toHaveBeenCalled()
  })

  it('re-arms in-memory jobs on loadPending when store lacks listScheduledJobs', async () => {
    const { scheduler, sendSnapshot } = makeScheduler({ store: {} })
    await scheduler.scheduleAt(new Date(1000), buildFor(JID))
    scheduler.dispose()
    await vi.advanceTimersByTimeAsync(1000)
    expect(sendSnapshot).not.toHaveBeenCalled()
    await scheduler.loadPending()
    await vi.advanceTimersByTimeAsync(1000)
    expect(sendSnapshot).toHaveBeenCalledTimes(1)
  })

  it('deletes the record on cancel', async () => {
    const saveScheduledJob = vi.fn(async () => undefined)
    const deleteScheduledJob = vi.fn(async (_id: string) => undefined)
    const { scheduler } = makeScheduler({ store: { saveScheduledJob, deleteScheduledJob } })
    const handle = await scheduler.scheduleAt(new Date(1000), buildFor(JID))
    handle.cancel()
    expect(deleteScheduledJob).toHaveBeenCalledWith(handle.id)
  })

  it('falls back to in-memory map when store lacks schedule methods', async () => {
    const { scheduler, sendSnapshot } = makeScheduler({ store: {} })
    await expect(scheduler.scheduleAt(new Date(1000), buildFor(JID))).resolves.toBeDefined()
    await vi.advanceTimersByTimeAsync(1000)
    expect(sendSnapshot).toHaveBeenCalledTimes(1)
  })

  it('loadPending is a no-op when store lacks listScheduledJobs', async () => {
    const { scheduler } = makeScheduler({ store: {} })
    await expect(scheduler.loadPending()).resolves.toBeUndefined()
  })

  it('loadPending sets timers for future jobs from the store', async () => {
    const future: ScheduledJobRecord = {
      id: 'job-future',
      fireAt: 1000,
      recipient: JID,
      payload: { recipient: JID, content: { text: 'persisted' } },
    }
    const listScheduledJobs = vi.fn(async () => [future])
    const deleteScheduledJob = vi.fn(async () => undefined)
    const { scheduler, sendSnapshot } = makeScheduler({
      store: { listScheduledJobs, deleteScheduledJob },
    })
    await scheduler.loadPending()
    expect(sendSnapshot).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(sendSnapshot).toHaveBeenCalledTimes(1)
    expect((sendSnapshot.mock.calls[0]?.[0] as ScheduledContentSnapshot).content).toMatchObject({
      text: 'persisted',
    })
  })

  it('loadPending fires overdue jobs immediately', async () => {
    vi.setSystemTime(5000)
    const overdue: ScheduledJobRecord = {
      id: 'job-overdue',
      fireAt: 1000,
      recipient: JID,
      payload: { recipient: JID, content: { text: 'overdue' } },
    }
    const listScheduledJobs = vi.fn(async () => [overdue])
    const deleteScheduledJob = vi.fn(async () => undefined)
    const { scheduler, sendSnapshot } = makeScheduler({
      store: { listScheduledJobs, deleteScheduledJob },
    })
    await scheduler.loadPending()
    await vi.advanceTimersByTimeAsync(0)
    expect(sendSnapshot).toHaveBeenCalledTimes(1)
    expect(deleteScheduledJob).toHaveBeenCalledWith('job-overdue')
  })

  it('restart: a new scheduler over the same persistent store reloads and fires', async () => {
    const saved: ScheduledJobRecord[] = []
    const store: Partial<MessageStore> = {
      saveScheduledJob: vi.fn(async (j: ScheduledJobRecord) => {
        saved.push(j)
      }),
      listScheduledJobs: vi.fn(async () => saved.slice()),
      deleteScheduledJob: vi.fn(async (id: string) => {
        const idx = saved.findIndex((s) => s.id === id)
        if (idx >= 0) saved.splice(idx, 1)
      }),
    }
    const first = makeScheduler({ store })
    await first.scheduler.scheduleAt(new Date(1000), buildFor(JID))
    first.scheduler.dispose()
    expect(saved).toHaveLength(1)

    const second = makeScheduler({ store })
    await second.scheduler.loadPending()
    await vi.advanceTimersByTimeAsync(1000)
    expect(second.sendSnapshot).toHaveBeenCalledTimes(1)
  })

  it('dispose clears pending timers without firing', async () => {
    const { scheduler, sendSnapshot } = makeScheduler()
    await scheduler.scheduleAt(new Date(1000), buildFor(JID))
    scheduler.dispose()
    await vi.advanceTimersByTimeAsync(1000)
    expect(sendSnapshot).not.toHaveBeenCalled()
  })

  it('fallback store still works with a capture socket builder', async () => {
    void captureSocket
    const { scheduler, sendSnapshot } = makeScheduler({ store: {} })
    await scheduler.scheduleAt(new Date(2000), (b) => b.to(JID).text('mixed'))
    await vi.advanceTimersByTimeAsync(2000)
    expect(sendSnapshot).toHaveBeenCalledTimes(1)
  })
})

const manualClock = (): {
  timer: SchedulerTimer
  now: () => number
  live: () => number
  advance: (ms: number) => Promise<void>
} => {
  let current = 0
  let seq = 0
  const pending = new Map<number, { at: number; cb: () => void }>()
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 50; i += 1) await Promise.resolve()
  }
  return {
    timer: {
      set: (cb, ms) => {
        seq += 1
        pending.set(seq, { at: current + ms, cb })
        return seq
      },
      clear: (handle) => {
        pending.delete(handle as number)
      },
    },
    now: () => current,
    live: () => pending.size,
    advance: async (ms) => {
      const target = current + ms
      for (;;) {
        let next: [number, { at: number; cb: () => void }] | undefined
        for (const entry of pending) {
          if (entry[1].at <= target && (next === undefined || entry[1].at < next[1].at)) next = entry
        }
        if (next === undefined) break
        pending.delete(next[0])
        current = next[1].at
        next[1].cb()
        await flush()
      }
      current = target
      await flush()
    },
  }
}

const memoryJobStore = (): { store: Partial<MessageStore>; saved: ScheduledJobRecord[] } => {
  const saved: ScheduledJobRecord[] = []
  const store: Partial<MessageStore> = {
    saveScheduledJob: vi.fn(async (job: ScheduledJobRecord) => {
      saved.push(job)
    }),
    listScheduledJobs: vi.fn(async () => saved.slice()),
    deleteScheduledJob: vi.fn(async (id: string) => {
      const idx = saved.findIndex((job) => job.id === id)
      if (idx >= 0) saved.splice(idx, 1)
    }),
  }
  return { store, saved }
}

const closedSocketError = (): Error =>
  Object.assign(new Error('Connection Closed'), { output: { statusCode: 428 } })

describe('Scheduler — sends while the client is not connected', () => {
  it('keeps the job pending through an outage longer than the retry budget', async () => {
    const clock = manualClock()
    const { store, saved } = memoryJobStore()
    let connected = false
    const sendSnapshot = vi.fn(async () => {
      if (!connected) throw closedSocketError()
    })
    const scheduler = new Scheduler({
      store: store as MessageStore,
      sendSnapshot,
      now: clock.now,
      timer: clock.timer,
    })
    await scheduler.scheduleAt(new Date(1000), buildFor(JID))
    await clock.advance(10 * 60_000)
    expect(saved).toHaveLength(1)
    expect(clock.live()).toBe(0)
    connected = true
    await scheduler.loadPending()
    await clock.advance(0)
    expect(sendSnapshot).toHaveBeenCalledTimes(2)
    expect(saved).toHaveLength(0)
  })

  it('does not count a NOT_CONNECTED failure as an attempt', async () => {
    const clock = manualClock()
    const { store, saved } = memoryJobStore()
    const sendSnapshot = vi.fn(async () => {
      throw new ZaileysAutomationError('NOT_CONNECTED', 'client not connected')
    })
    const scheduler = new Scheduler({
      store: store as MessageStore,
      sendSnapshot,
      now: clock.now,
      timer: clock.timer,
    })
    await scheduler.scheduleAt(new Date(1000), buildFor(JID))
    for (let i = 0; i < 8; i += 1) {
      await scheduler.loadPending()
      await clock.advance(60_000)
    }
    expect(sendSnapshot).toHaveBeenCalledTimes(8)
    expect(saved).toHaveLength(1)
  })

  it('still drops a job after five ordinary send failures', async () => {
    const clock = manualClock()
    const { store, saved } = memoryJobStore()
    const sendSnapshot = vi.fn(async () => {
      throw new Error('bad payload')
    })
    const scheduler = new Scheduler({
      store: store as MessageStore,
      sendSnapshot,
      now: clock.now,
      timer: clock.timer,
    })
    await scheduler.scheduleAt(new Date(1000), buildFor(JID))
    await clock.advance(10 * 60_000)
    expect(sendSnapshot).toHaveBeenCalledTimes(5)
    expect(saved).toHaveLength(0)
  })
})

describe('Scheduler — dispose while a send is in flight', () => {
  it('leaves no timer behind when the in-flight send fails after dispose', async () => {
    const clock = manualClock()
    const { store, saved } = memoryJobStore()
    let rejectSend: (err: Error) => void = () => undefined
    const sendSnapshot = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSend = reject
        }),
    )
    const scheduler = new Scheduler({
      store: store as MessageStore,
      sendSnapshot,
      now: clock.now,
      timer: clock.timer,
    })
    await scheduler.scheduleAt(new Date(1000), buildFor(JID))
    await clock.advance(1000)
    expect(sendSnapshot).toHaveBeenCalledTimes(1)
    scheduler.dispose()
    rejectSend(new Error('send failed'))
    await clock.advance(0)
    expect(clock.live()).toBe(0)
    expect(saved).toHaveLength(1)
  })

  it('re-arms pending jobs when loadPending runs after dispose', async () => {
    const clock = manualClock()
    const { store, saved } = memoryJobStore()
    const sendSnapshot = vi.fn(async () => undefined)
    const scheduler = new Scheduler({
      store: store as MessageStore,
      sendSnapshot,
      now: clock.now,
      timer: clock.timer,
    })
    await scheduler.scheduleAt(new Date(1000), buildFor(JID))
    scheduler.dispose()
    expect(clock.live()).toBe(0)
    await scheduler.loadPending()
    expect(clock.live()).toBe(1)
    await clock.advance(1000)
    expect(sendSnapshot).toHaveBeenCalledTimes(1)
    expect(saved).toHaveLength(0)
  })
})
