export type OperationGuardClock = {
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

/**
 * Per-category minimum-interval throttle for sensitive account operations
 * (group/community/newsletter create, join, member changes). Spacing these out
 * avoids the rapid-fire pattern WhatsApp flags as automated/bulk abuse.
 */
export type OperationCategory =
  | 'group.create'
  | 'group.join'
  | 'group.participants'
  | 'group.update'
  | 'community.create'
  | 'community.join'
  | 'community.update'
  | 'newsletter.create'
  | 'newsletter.follow'
  | 'newsletter.update'

export interface OperationGuardOptions {
  /** Master switch. When `false` operations run with no spacing. Default `true`. */
  enabled?: boolean
  /** Per-category minimum interval in ms, overriding the built-in defaults. */
  intervalsMs?: Partial<Record<OperationCategory, number>>
}

export interface OperationGuard {
  run<T>(category: OperationCategory, op: () => Promise<T>): Promise<T>
}

const DEFAULT_INTERVALS_MS: Record<OperationCategory, number> = {
  'group.create': 60_000,
  'group.join': 30_000,
  'group.participants': 10_000,
  'group.update': 3_000,
  'community.create': 120_000,
  'community.join': 30_000,
  'community.update': 3_000,
  'newsletter.create': 120_000,
  'newsletter.follow': 2_000,
  'newsletter.update': 3_000,
}

const defaultSleep = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms))

export function createOperationGuard(
  options: OperationGuardOptions = {},
  clock: OperationGuardClock = {},
): OperationGuard {
  const enabled = options.enabled ?? true
  const now = clock.now ?? Date.now
  const sleep = clock.sleep ?? defaultSleep
  const intervals = { ...DEFAULT_INTERVALS_MS, ...(options.intervalsMs ?? {}) }

  const lastAt = new Map<OperationCategory, number>()
  const chain = new Map<OperationCategory, Promise<unknown>>()

  const spaced = async <T>(category: OperationCategory, op: () => Promise<T>): Promise<T> => {
    const interval = intervals[category] ?? 0
    const prev = lastAt.get(category)
    if (prev !== undefined && interval > 0) {
      const wait = interval - (now() - prev)
      if (wait > 0) await sleep(wait)
    }
    lastAt.set(category, now())
    return op()
  }

  return {
    run<T>(category: OperationCategory, op: () => Promise<T>): Promise<T> {
      if (!enabled) return op()
      const tail = chain.get(category) ?? Promise.resolve()
      const next = tail.then(
        () => spaced(category, op),
        () => spaced(category, op),
      )
      chain.set(
        category,
        next.then(
          () => undefined,
          () => undefined,
        ),
      )
      return next
    },
  }
}
