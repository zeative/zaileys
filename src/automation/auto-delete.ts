import type { Logger } from '../client/types.js'
import type { MessageStore, PruneOptions } from '../store/types.js'

export type AutoDeleteOptions = {
  maxAgeMs?: number
  maxPerChat?: number
  intervalMs?: number
  chats?: 'all' | ((jid: string) => boolean)
}

export async function genericPrune(store: MessageStore, opts: PruneOptions): Promise<number> {
  if (typeof store.deleteMessage !== 'function' || typeof store.listChats !== 'function') return 0
  const chats = await store.listChats()
  let removed = 0
  for (const chat of chats) {
    const jid = (chat as { id?: string }).id ?? ''
    if (jid.length === 0) continue
    if (opts.chatFilter && !opts.chatFilter(jid)) continue
    const msgs = await store.listMessages(jid)
    const sorted = [...msgs].sort(
      (a, b) => Number(b.messageTimestamp ?? 0) - Number(a.messageTimestamp ?? 0),
    )
    for (let idx = 0; idx < sorted.length; idx += 1) {
      const m = sorted[idx]!
      const ts = Number(m.messageTimestamp ?? 0)
      const tooOld = opts.olderThan !== undefined && ts < opts.olderThan
      const overflow = opts.maxPerChat !== undefined && idx >= opts.maxPerChat
      if (tooOld || overflow) {
        await store.deleteMessage(m.key)
        removed += 1
      }
    }
  }
  return removed
}

export class AutoDeleteSweeper {
  private readonly store: MessageStore
  private readonly options: AutoDeleteOptions
  private readonly logger: Logger | undefined
  private readonly now: () => number
  private timer: ReturnType<typeof setInterval> | undefined
  private running = false
  private warnedUnsupported = false
  private disabled = false

  constructor(deps: {
    store: MessageStore
    options: AutoDeleteOptions
    logger?: Logger
    now?: () => number
  }) {
    this.store = deps.store
    this.options = deps.options
    this.logger = deps.logger
    this.now = deps.now ?? Date.now
  }

  private get active(): boolean {
    return this.options.maxAgeMs !== undefined || this.options.maxPerChat !== undefined
  }

  private buildPruneOptions(): PruneOptions {
    const opts: PruneOptions = {}
    if (this.options.maxAgeMs !== undefined) opts.olderThan = this.now() - this.options.maxAgeMs
    if (this.options.maxPerChat !== undefined) opts.maxPerChat = this.options.maxPerChat
    if (typeof this.options.chats === 'function') opts.chatFilter = this.options.chats
    return opts
  }

  async runOnce(): Promise<number> {
    if (!this.active || this.disabled) return 0
    const opts = this.buildPruneOptions()
    if (typeof this.store.pruneMessages === 'function') {
      return this.store.pruneMessages(opts)
    }
    if (typeof this.store.deleteMessage === 'function') {
      return genericPrune(this.store, opts)
    }
    this.disabled = true
    if (!this.warnedUnsupported) {
      this.warnedUnsupported = true
      this.logger?.warn(
        { code: 'AUTO_DELETE_UNSUPPORTED' },
        'autoDelete: store implements neither pruneMessages nor deleteMessage; sweeper disabled',
      )
    }
    return 0
  }

  start(): void {
    if (!this.active || this.timer) return
    const interval = this.options.intervalMs ?? 60_000
    this.timer = setInterval(() => {
      if (this.running) return
      this.running = true
      void this.runOnce()
        .catch((err) => this.logger?.warn(err, 'autoDelete sweep failed'))
        .finally(() => {
          this.running = false
        })
    }, interval)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }
}
