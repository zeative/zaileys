import { describe, expect, it, vi } from 'vitest'
import { TypedEventEmitter } from '../../src/client/event-emitter.js'

interface TestMap extends Record<string, unknown> {
  hello: { msg: string }
  count: { n: number }
}

describe('TypedEventEmitter — basics', () => {
  it('on() invokes handler when emit() fires same event', () => {
    const em = new TypedEventEmitter<TestMap>()
    const fn = vi.fn()
    em.on('hello', fn)
    em.emit('hello', { msg: 'hi' })
    expect(fn).toHaveBeenCalledWith({ msg: 'hi' })
  })

  it('handlers fire in registration order', () => {
    const em = new TypedEventEmitter<TestMap>()
    const order: number[] = []
    em.on('count', () => order.push(1))
    em.on('count', () => order.push(2))
    em.on('count', () => order.push(3))
    em.emit('count', { n: 0 })
    expect(order).toEqual([1, 2, 3])
  })

  it('off() removes a specific handler', () => {
    const em = new TypedEventEmitter<TestMap>()
    const a = vi.fn()
    const b = vi.fn()
    em.on('hello', a)
    em.on('hello', b)
    em.off('hello', a)
    em.emit('hello', { msg: 'x' })
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('on() returns an unsubscribe function', () => {
    const em = new TypedEventEmitter<TestMap>()
    const fn = vi.fn()
    const unsub = em.on('hello', fn)
    expect(typeof unsub).toBe('function')
    unsub()
    em.emit('hello', { msg: 'after' })
    expect(fn).not.toHaveBeenCalled()
  })

  it('removeAllListeners() drops every handler when called without args', () => {
    const em = new TypedEventEmitter<TestMap>()
    em.on('hello', vi.fn())
    em.on('count', vi.fn())
    em.removeAllListeners()
    expect(em.listenerCount('hello')).toBe(0)
    expect(em.listenerCount('count')).toBe(0)
  })

  it('removeAllListeners(event) only drops that event', () => {
    const em = new TypedEventEmitter<TestMap>()
    em.on('hello', vi.fn())
    em.on('count', vi.fn())
    em.removeAllListeners('hello')
    expect(em.listenerCount('hello')).toBe(0)
    expect(em.listenerCount('count')).toBe(1)
  })

  it('listenerCount() reports correct number', () => {
    const em = new TypedEventEmitter<TestMap>()
    expect(em.listenerCount('hello')).toBe(0)
    em.on('hello', vi.fn())
    em.on('hello', vi.fn())
    expect(em.listenerCount('hello')).toBe(2)
  })

  it('emit() with no listeners does not throw', () => {
    const em = new TypedEventEmitter<TestMap>()
    expect(() => em.emit('hello', { msg: 'x' })).not.toThrow()
  })

  it('different event names do not cross-contaminate', () => {
    const em = new TypedEventEmitter<TestMap>()
    const helloFn = vi.fn()
    const countFn = vi.fn()
    em.on('hello', helloFn)
    em.on('count', countFn)
    em.emit('hello', { msg: 'x' })
    expect(helloFn).toHaveBeenCalledTimes(1)
    expect(countFn).not.toHaveBeenCalled()
  })

  it('separate emitter instances do not share state', () => {
    const a = new TypedEventEmitter<TestMap>()
    const b = new TypedEventEmitter<TestMap>()
    const fn = vi.fn()
    a.on('hello', fn)
    b.emit('hello', { msg: 'b' })
    expect(fn).not.toHaveBeenCalled()
  })

  it('throwing listener does not block subsequent listeners', () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
    const em = new TypedEventEmitter<TestMap>({ logger })
    const second = vi.fn()
    em.on('hello', () => { throw new Error('boom') })
    em.on('hello', second)
    expect(() => em.emit('hello', { msg: 'x' })).not.toThrow()
    expect(second).toHaveBeenCalledTimes(1)
    expect(logger.error).toHaveBeenCalled()
  })

  it('logger is optional when listener throws', () => {
    const em = new TypedEventEmitter<TestMap>()
    em.on('hello', () => { throw new Error('boom') })
    expect(() => em.emit('hello', { msg: 'x' })).not.toThrow()
  })

  it('unsub via on() return value is idempotent', () => {
    const em = new TypedEventEmitter<TestMap>()
    const fn = vi.fn()
    const unsub = em.on('hello', fn)
    unsub()
    unsub()
    em.emit('hello', { msg: 'x' })
    expect(fn).not.toHaveBeenCalled()
  })

  it('off() removing absent handler is a silent no-op', () => {
    const em = new TypedEventEmitter<TestMap>()
    const fn = vi.fn()
    expect(() => em.off('hello', fn)).not.toThrow()
  })

  it('emit passes the exact payload reference', () => {
    const em = new TypedEventEmitter<TestMap>()
    const payload = { msg: 'ref' }
    let received: { msg: string } | undefined
    em.on('hello', (p) => { received = p })
    em.emit('hello', payload)
    expect(received).toBe(payload)
  })

  it('handlers added during emit() of same event do not fire in current emit', () => {
    const em = new TypedEventEmitter<TestMap>()
    const late = vi.fn()
    em.on('hello', () => { em.on('hello', late) })
    em.emit('hello', { msg: 'x' })
    expect(late).not.toHaveBeenCalled()
    em.emit('hello', { msg: 'y' })
    expect(late).toHaveBeenCalledTimes(1)
  })
})
