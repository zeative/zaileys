import { randomUUID } from 'node:crypto'
import type { AnyMessageContent, MiscMessageGenerationOptions, WAMessage } from 'baileys'
import { MessageBuilder, type BuilderSocketLike } from '../builder/builder.js'
import type { MessageStore, ScheduledJobRecord } from '../store/types.js'
import type { Logger } from '../client/types.js'
import { ZaileysAutomationError } from './errors.js'

export type ScheduledContentSnapshot = {
  recipient: string
  content: AnyMessageContent
  options?: MiscMessageGenerationOptions
}

export type SchedulerTimer = {
  set: (cb: () => void, ms: number) => unknown
  clear: (handle: unknown) => void
}

export type SchedulerDeps = {
  store: MessageStore
  sendSnapshot: (snapshot: ScheduledContentSnapshot) => Promise<void>
  now?: () => number
  timer?: SchedulerTimer
  logger?: Logger
  acquire?: () => Promise<void>
}

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

export class Scheduler {
  private readonly store: MessageStore
  private readonly sendSnapshot: (snapshot: ScheduledContentSnapshot) => Promise<void>
  private readonly now: () => number
  private readonly timer: SchedulerTimer
  private readonly logger: Logger | undefined
  private readonly acquire: (() => Promise<void>) | undefined
  private readonly memory: Map<string, ScheduledJobRecord> = new Map()
  private readonly timers: Map<string, unknown> = new Map()

  constructor(deps: SchedulerDeps) {
    this.store = deps.store
    this.sendSnapshot = deps.sendSnapshot
    this.now = deps.now ?? (() => Date.now())
    this.timer = deps.timer ?? DEFAULT_TIMER
    this.logger = deps.logger
    this.acquire = deps.acquire
  }

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

  async loadPending(): Promise<void> {
    const list = this.store.listScheduledJobs
    if (!list) {
      for (const job of this.memory.values()) {
        if (!this.timers.has(job.id)) this.arm(job)
      }
      return
    }
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
    if (isSnapshot(record.payload)) {
      try {
        if (this.acquire) await this.acquire()
        await this.sendSnapshot(record.payload)
      } catch (err) {
        this.logger?.warn(err, 'scheduled send failed; retaining job for retry')
        return
      }
    }
    this.memory.delete(record.id)
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
    let sendCount = 0
    const captureSocket: BuilderSocketLike = {
      sendMessage: async (
        jid: string,
        content: AnyMessageContent,
        options?: MiscMessageGenerationOptions,
      ): Promise<WAMessage | undefined> => {
        sendCount += 1
        if (sendCount > 1) {
          throw new ZaileysAutomationError(
            'SCHEDULE_INVALID',
            'scheduling multi-part messages (e.g. album) is not supported; schedule a single message',
          )
        }
        captured = options ? { recipient: jid, content, options } : { recipient: jid, content }
        return { key: { remoteJid: jid, id: 'scheduled-snapshot', fromMe: true } } as WAMessage
      },
      relayMessage: async (): Promise<string> => {
        throw new ZaileysAutomationError(
          'SCHEDULE_INVALID',
          'scheduling interactive/relayed content is not supported; schedule a text or media message',
        )
      },
    }
    const builder = MessageBuilder.create(captureSocket, '')
    try {
      await build(builder)
    } catch (err) {
      if (err instanceof ZaileysAutomationError) throw err
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
