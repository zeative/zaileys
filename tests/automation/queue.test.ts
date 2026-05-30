import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskQueue } from '../../src/automation/queue.js'

const flush = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
  }
}

describe('TaskQueue basic execution', () => {
  it('resolves with the task return value', async () => {
    const queue = new TaskQueue()
    await expect(queue.add(async () => 42)).resolves.toBe(42)
  })

  it('runs a single task to completion', async () => {
    const queue = new TaskQueue()
    let ran = false
    await queue.add(async () => {
      ran = true
    })
    expect(ran).toBe(true)
  })

  it('runs multiple sequential tasks at default concurrency', async () => {
    const queue = new TaskQueue()
    const order: number[] = []
    await Promise.all([
      queue.add(async () => {
        order.push(1)
      }),
      queue.add(async () => {
        order.push(2)
      }),
      queue.add(async () => {
        order.push(3)
      }),
    ])
    expect(order).toEqual([1, 2, 3])
  })

  it('propagates a rejection when no retries are configured', async () => {
    const queue = new TaskQueue()
    await expect(queue.add(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
  })

  it('preserves typed return values', async () => {
    const queue = new TaskQueue()
    const value: string = await queue.add(async () => 'hello')
    expect(value).toBe('hello')
  })
})

describe('TaskQueue concurrency', () => {
  it('never exceeds concurrency=1', async () => {
    const queue = new TaskQueue({ concurrency: 1 })
    let active = 0
    let max = 0
    const task = async (): Promise<void> => {
      active++
      max = Math.max(max, active)
      await Promise.resolve()
      active--
    }
    await Promise.all([queue.add(task), queue.add(task), queue.add(task)])
    expect(max).toBe(1)
  })

  it('allows up to concurrency=2 tasks in flight', async () => {
    const queue = new TaskQueue({ concurrency: 2 })
    let active = 0
    let max = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const task = async (): Promise<void> => {
      active++
      max = Math.max(max, active)
      await gate
      active--
    }
    const all = Promise.all([queue.add(task), queue.add(task), queue.add(task), queue.add(task)])
    await flush()
    expect(max).toBe(2)
    release()
    await all
  })

  it('drains all tasks even when count exceeds concurrency', async () => {
    const queue = new TaskQueue({ concurrency: 3 })
    let done = 0
    const tasks = Array.from({ length: 10 }, () =>
      queue.add(async () => {
        done++
      }),
    )
    await Promise.all(tasks)
    expect(done).toBe(10)
  })

  it('defaults concurrency to 1 when unset', async () => {
    const queue = new TaskQueue()
    let active = 0
    let max = 0
    const task = async (): Promise<void> => {
      active++
      max = Math.max(max, active)
      await Promise.resolve()
      active--
    }
    await Promise.all([queue.add(task), queue.add(task)])
    expect(max).toBe(1)
  })
})

describe('TaskQueue retry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retries a task that fails twice then succeeds within maxRetries=3', async () => {
    const queue = new TaskQueue({ retry: { maxRetries: 3, backoffMs: () => 0 } })
    let attempts = 0
    const result = queue.add(async () => {
      attempts++
      if (attempts < 3) {
        throw new Error('transient')
      }
      return 'ok'
    })
    await vi.runAllTimersAsync()
    await expect(result).resolves.toBe('ok')
    expect(attempts).toBe(3)
  })

  it('rejects after exhausting maxRetries=2 (3 attempts total)', async () => {
    const queue = new TaskQueue({ retry: { maxRetries: 2, backoffMs: () => 0 } })
    let attempts = 0
    const result = queue.add(async () => {
      attempts++
      throw new Error('always')
    })
    const assertion = expect(result).rejects.toThrow('always')
    await vi.runAllTimersAsync()
    await assertion
    expect(attempts).toBe(3)
  })

  it('runs exactly one attempt when maxRetries=0', async () => {
    const queue = new TaskQueue({ retry: { maxRetries: 0, backoffMs: () => 0 } })
    let attempts = 0
    const result = queue.add(async () => {
      attempts++
      throw new Error('once')
    })
    const assertion = expect(result).rejects.toThrow('once')
    await vi.runAllTimersAsync()
    await assertion
    expect(attempts).toBe(1)
  })

  it('rethrows the original error rather than wrapping it', async () => {
    const queue = new TaskQueue({ retry: { maxRetries: 1, backoffMs: () => 0 } })
    const original = new Error('source')
    const result = queue.add(async () => {
      throw original
    })
    const assertion = expect(result).rejects.toBe(original)
    await vi.runAllTimersAsync()
    await assertion
  })

  it('calls backoffMs with the upcoming attempt number (1, 2)', async () => {
    const seen: number[] = []
    const queue = new TaskQueue({
      retry: {
        maxRetries: 2,
        backoffMs: (attempt) => {
          seen.push(attempt)
          return 0
        },
      },
    })
    const result = queue.add(async () => {
      throw new Error('x')
    })
    const assertion = expect(result).rejects.toThrow('x')
    await vi.runAllTimersAsync()
    await assertion
    expect(seen).toEqual([1, 2])
  })

  it('honours the backoff delay before retrying', async () => {
    const queue = new TaskQueue({ retry: { maxRetries: 1, backoffMs: () => 500 } })
    let attempts = 0
    const result = queue.add(async () => {
      attempts++
      if (attempts < 2) {
        throw new Error('retry')
      }
      return 'done'
    })
    await flush()
    expect(attempts).toBe(1)
    await vi.advanceTimersByTimeAsync(499)
    expect(attempts).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toBe('done')
    expect(attempts).toBe(2)
  })

  it('applies escalating backoff per attempt', async () => {
    const delays: number[] = []
    const queue = new TaskQueue({
      retry: {
        maxRetries: 3,
        backoffMs: (attempt) => {
          const ms = attempt * 100
          delays.push(ms)
          return ms
        },
      },
    })
    const result = queue.add(async () => {
      throw new Error('always')
    })
    const assertion = expect(result).rejects.toThrow('always')
    await vi.runAllTimersAsync()
    await assertion
    expect(delays).toEqual([100, 200, 300])
  })

  it('defaults to zero retries when no retry policy is supplied', async () => {
    const queue = new TaskQueue()
    let attempts = 0
    await expect(
      queue.add(async () => {
        attempts++
        throw new Error('no-retry')
      }),
    ).rejects.toThrow('no-retry')
    expect(attempts).toBe(1)
  })
})

describe('TaskQueue retry with injectable sleep', () => {
  it('uses an injected sleep for backoff', async () => {
    const sleeps: number[] = []
    const queue = new TaskQueue(
      { retry: { maxRetries: 2, backoffMs: (a) => a * 10 } },
      {
        sleep: async (ms) => {
          sleeps.push(ms)
        },
      },
    )
    let attempts = 0
    const result = queue.add(async () => {
      attempts++
      if (attempts < 3) {
        throw new Error('t')
      }
      return 'ok'
    })
    await expect(result).resolves.toBe('ok')
    expect(sleeps).toEqual([10, 20])
  })
})

describe('TaskQueue onIdle', () => {
  it('resolves immediately when the queue is empty', async () => {
    const queue = new TaskQueue()
    await expect(queue.onIdle()).resolves.toBeUndefined()
  })

  it('resolves once all in-flight tasks settle', async () => {
    const queue = new TaskQueue({ concurrency: 2 })
    let done = 0
    for (let i = 0; i < 5; i++) {
      void queue.add(async () => {
        done++
      })
    }
    await queue.onIdle()
    expect(done).toBe(5)
  })

  it('resolves even when some tasks reject', async () => {
    const queue = new TaskQueue({ concurrency: 2 })
    void queue.add(async () => 1).catch(() => undefined)
    void queue.add(async () => Promise.reject(new Error('x'))).catch(() => undefined)
    void queue.add(async () => 3).catch(() => undefined)
    await expect(queue.onIdle()).resolves.toBeUndefined()
  })
})
