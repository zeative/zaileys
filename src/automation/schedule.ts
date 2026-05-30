import { randomUUID } from 'node:crypto'
import type { AnyMessageContent, MiscMessageGenerationOptions, WAMessage } from 'baileys'
import { MessageBuilder, type BuilderSocketLike } from '../builder/builder.js'
import type { MessageStore, ScheduledJobRecord } from '../store/types.js'
import type { Logger } from '../client/types.js'
import { ZaileysAutomationError } from './errors.js'

/**
 * Serializable snapshot of a scheduled send. Produced by evaluating the builder
 * callback once at schedule time; `content` and `options` are exactly what the
 * builder would have dispatched, with `recipient` resolved to a concrete jid.
 */
export type ScheduledContentSnapshot = {
  recipient: string
  content: AnyMessageContent
  options?: MiscMessageGenerationOptions
}

/**
 * Injectable timer primitives so tests can drive the scheduler with fake
 * timers. Defaults to the global `setTimeout`/`clearTimeout`.
 */
export type SchedulerTimer = {
  set: (cb: () => void, ms: number) => unknown
  clear: (handle: unknown) => void
}

/**
 * Construction dependencies for {@link Scheduler}.
 *
 * - `store` persists records via the optional `saveScheduledJob`/
 *   `listScheduledJobs`/`deleteScheduledJob` methods; when absent the scheduler
 *   falls back to an internal `Map` (no restart-survival, non-breaking).
 * - `sendSnapshot` dispatches a fired snapshot (wired to `client.send` by the
 *   Client).
 * - `now`/`timer` are injectable for deterministic tests.
 */
export type SchedulerDeps = {
  store: MessageStore
  sendSnapshot: (snapshot: ScheduledContentSnapshot) => Promise<void>
  now?: () => number
  timer?: SchedulerTimer
  logger?: Logger
}

/** A scheduled send returned by {@link Scheduler.scheduleAt}. */
export type ScheduleHandle = {
  id: string
  cancel(): void
}

const DEFAULT_TIMER: SchedulerTimer = {
  set: (cb, ms) => setTimeout(cb, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

const isSnapshot = (value: unknown): value is ScheduledContentSnapshot =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { recipient?: unknown }).recipient === 'string' &&
  typeof (value as { content?: unknown }).content === 'object'

/**
 * Persisting scheduled-message dispatcher. `scheduleAt(date, build)` keeps the
 * locked builder-callback signature but evaluates the builder eagerly into a
 * serializable {@link ScheduledContentSnapshot}: the callback runs once, its
 * dispatch is captured (recipient + content + options), and that snapshot — not
 * the closure — is persisted. On fire the snapshot is re-dispatched through
 * `sendSnapshot`. This survives restart whenever the store implements the
 * optional schedule methods; otherwise an in-memory `Map` keeps timers alive
 * for the process lifetime.
 *
 * Trade-off: side effects inside the builder callback (media uploads, dynamic
 * lookups) run at schedule time, not fire time.
 */
export class Scheduler {
  private readonly store: MessageStore
  private readonly sendSnapshot: (snapshot: ScheduledContentSnapshot) => Promise<void>
  private readonly now: () => number
  private readonly timer: SchedulerTimer
  private readonly logger: Logger | undefined
  private readonly memory: Map<string, ScheduledJobRecord> = new Map()
  private readonly timers: Map<string, unknown> = new Map()

  constructor(deps: SchedulerDeps) {
    this.store = deps.store
    this.sendSnapshot = deps.sendSnapshot
    this.now = deps.now ?? (() => Date.now())
    this.timer = deps.timer ?? DEFAULT_TIMER
    this.logger = deps.logger
  }

  /**
   * Schedule `build`'s message for `date`. The builder is evaluated eagerly into
   * a serializable snapshot, persisted, and re-dispatched on fire. A past `date`
   * fires on the next tick. Returns `{ id, cancel() }`.
   */
  async scheduleAt(
    date: Date,
    build: (b: MessageBuilder<'init'>) => MessageBuilder<'content-set'>,
  ): Promise<ScheduleHandle> {
    const fireAt = date.getTime()
    if (Number.isNaN(fireAt)) {
      throw new ZaileysAutomationError('SCHEDULE_INVALID', 'scheduleAt requires a valid Date')
    }
    const snapshot = await this.evaluate(build)
    const id = randomUUID()
    const record: ScheduledJobRecord = { id, fireAt, recipient: snapshot.recipient, payload: snapshot }
    await this.persist(record)
    this.arm(record)
    return { id, cancel: () => void this.cancel(id) }
  }

  /**
   * Reload persisted jobs from the store and re-arm their timers. Overdue jobs
   * fire on the next tick. A no-op when the store lacks `listScheduledJobs`.
   */
  async loadPending(): Promise<void> {
    const list = this.store.listScheduledJobs
    if (!list) return
    let jobs: ScheduledJobRecord[]
    try {
      jobs = await list.call(this.store)
    } catch (err) {
      this.logger?.warn(err, 'scheduler loadPending failed')
      return
    }
    for (const job of jobs) {
      if (this.timers.has(job.id)) continue
      this.memory.set(job.id, job)
      this.arm(job)
    }
  }

  /** Clear every pending timer without firing. Records stay persisted. */
  dispose(): void {
    for (const handle of this.timers.values()) this.timer.clear(handle)
    this.timers.clear()
  }

  private cancel(id: string): void {
    const handle = this.timers.get(id)
    if (handle !== undefined) {
      this.timer.clear(handle)
      this.timers.delete(id)
    }
    this.memory.delete(id)
    void this.remove(id)
  }

  private arm(record: ScheduledJobRecord): void {
    const delay = Math.max(0, record.fireAt - this.now())
    const handle = this.timer.set(() => {
      void this.fire(record)
    }, delay)
    this.timers.set(record.id, handle)
  }

  private async fire(record: ScheduledJobRecord): Promise<void> {
    this.timers.delete(record.id)
    this.memory.delete(record.id)
    if (isSnapshot(record.payload)) {
      try {
        await this.sendSnapshot(record.payload)
      } catch (err) {
        this.logger?.warn(err, 'scheduled send failed')
      }
    }
    await this.remove(record.id)
  }

  private async persist(record: ScheduledJobRecord): Promise<void> {
    const save = this.store.saveScheduledJob
    if (save) {
      await save.call(this.store, record)
      return
    }
    this.memory.set(record.id, record)
  }

  private async remove(id: string): Promise<void> {
    const del = this.store.deleteScheduledJob
    if (del) {
      try {
        await del.call(this.store, id)
      } catch (err) {
        this.logger?.warn(err, 'scheduler deleteScheduledJob failed')
      }
    }
    this.memory.delete(id)
  }

  private async evaluate(
    build: (b: MessageBuilder<'init'>) => MessageBuilder<'content-set'>,
  ): Promise<ScheduledContentSnapshot> {
    let captured: ScheduledContentSnapshot | undefined
    const captureSocket: BuilderSocketLike = {
      sendMessage: async (
        jid: string,
        content: AnyMessageContent,
        options?: MiscMessageGenerationOptions,
      ): Promise<WAMessage | undefined> => {
        captured = options ? { recipient: jid, content, options } : { recipient: jid, content }
        return { key: { remoteJid: jid, id: 'scheduled-snapshot', fromMe: true } } as WAMessage
      },
    }
    const builder = MessageBuilder.create(captureSocket, '')
    try {
      await build(builder)
    } catch (err) {
      throw new ZaileysAutomationError('SCHEDULE_INVALID', 'scheduled builder evaluation failed', {
        cause: err,
      })
    }
    if (!captured) {
      throw new ZaileysAutomationError('SCHEDULE_INVALID', 'scheduled builder produced no content')
    }
    return captured
  }
}
