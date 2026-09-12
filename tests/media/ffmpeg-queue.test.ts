import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))
vi.mock('child_process', () => ({ spawn: (...args: unknown[]) => spawnMock(...args) }))

import { FFmpegProcessor, configureMediaLimits, getMediaLimits } from '../../src/media/ffmpeg/core.js'

class FakeChild extends EventEmitter {
  stdout = new EventEmitter()
  kill = vi.fn()
}

const children: FakeChild[] = []
const job = (): Promise<void> =>
  FFmpegProcessor.process({
    input: '/in',
    output: '/out',
    options: [],
    onEnd: async () => undefined,
    onError: async () => undefined,
  })

beforeEach(() => {
  children.length = 0
  spawnMock.mockReset()
  spawnMock.mockImplementation(() => {
    const c = new FakeChild()
    children.push(c)
    return c
  })
})

afterEach(() => {
  for (const c of children) c.emit('close', 0)
  configureMediaLimits({ maxConcurrent: 4, maxQueued: 64, queueTimeoutMs: 120_000 })
})

describe('ffmpeg job queue', () => {
  it('never runs more children than maxConcurrent, even when a slot is handed over', async () => {
    configureMediaLimits({ maxConcurrent: 2, maxQueued: 10, queueTimeoutMs: 5_000 })
    const open = new Set<FakeChild>()
    let peak = 0
    spawnMock.mockImplementation(() => {
      const c = new FakeChild()
      children.push(c)
      open.add(c)
      peak = Math.max(peak, open.size)
      return c
    })
    const finish = (c: FakeChild): void => {
      open.delete(c)
      c.emit('close', 0)
    }
    const jobs = Array.from({ length: 6 }, () => job())
    for (let spawned = 2; spawned <= 6; spawned += 2) {
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(spawned))
      for (const c of [...open]) finish(c)
      /** A fresh caller arriving mid-handoff is exactly when the old slot logic overshot. */
      if (spawned === 2) void job().catch(() => undefined)
    }
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(7))
    for (const c of [...open]) finish(c)
    await Promise.all(jobs)
    expect(peak).toBeLessThanOrEqual(2)
  })

  it('rejects new work once the queue is full instead of growing without bound', async () => {
    configureMediaLimits({ maxConcurrent: 1, maxQueued: 1, queueTimeoutMs: 5_000 })
    const running = job()
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    const queued = job()
    await expect(job()).rejects.toThrow(/queue is full/i)
    children[0]!.emit('close', 0)
    await running
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2))
    children[1]!.emit('close', 0)
    await queued
  })

  it('rejects a job that waits longer than queueTimeoutMs', async () => {
    configureMediaLimits({ maxConcurrent: 1, maxQueued: 5, queueTimeoutMs: 50 })
    const running = job()
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    await expect(job()).rejects.toThrow(/waited more than 50ms/i)
    children[0]!.emit('close', 0)
    await running
  })

  it('a timed-out waiter does not steal the slot later', async () => {
    configureMediaLimits({ maxConcurrent: 1, maxQueued: 5, queueTimeoutMs: 30 })
    const running = job()
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    await expect(job()).rejects.toThrow()
    children[0]!.emit('close', 0)
    await running
    const next = job()
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2))
    children[1]!.emit('close', 0)
    await next
  })

  it('validates limits', () => {
    expect(() => configureMediaLimits({ maxConcurrent: 0 })).toThrow()
    expect(() => configureMediaLimits({ maxQueued: -1 })).toThrow()
    expect(() => configureMediaLimits({ queueTimeoutMs: Number.NaN })).toThrow()
    configureMediaLimits({ maxConcurrent: 3 })
    expect(getMediaLimits().maxConcurrent).toBe(3)
  })
})
