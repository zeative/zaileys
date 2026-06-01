import { EventEmitter } from 'node:events'
import type { Logger } from './types.js'

export interface TypedEventEmitterOptions {
  logger?: Logger | undefined
}

export class TypedEventEmitter<M extends Record<string, unknown>> {
  private readonly inner: EventEmitter = new EventEmitter()
  protected readonly emitterLogger: Logger | undefined

  constructor(options?: TypedEventEmitterOptions) {
    this.emitterLogger = options?.logger
    this.inner.setMaxListeners(0)
  }

  on<E extends keyof M>(event: E, handler: (payload: M[E]) => void): () => void {
    const wrapped = this.wrap(event, handler)
    this.tag(handler, event, wrapped)
    this.inner.on(event as string, wrapped)
    let removed = false
    return () => {
      if (removed) return
      removed = true
      this.inner.off(event as string, wrapped)
      this.untag(handler, event)
    }
  }

  off<E extends keyof M>(event: E, handler: (payload: M[E]) => void): void {
    const wrapped = this.lookup(handler, event)
    if (wrapped) {
      this.inner.off(event as string, wrapped)
      this.untag(handler, event)
    }
  }

  emit<E extends keyof M>(event: E, payload: M[E]): void {
    const listeners = this.inner.listeners(event as string).slice()
    for (const fn of listeners) {
      try {
        ;(fn as (p: M[E]) => void)(payload)
      } catch (err) {
        this.emitterLogger?.error(err, 'listener threw')
      }
    }
  }

  removeAllListeners(event?: keyof M): void {
    if (event === undefined) this.inner.removeAllListeners()
    else this.inner.removeAllListeners(event as string)
  }

  listenerCount(event: keyof M): number {
    return this.inner.listenerCount(event as string)
  }

  private wrap<E extends keyof M>(
    _event: E,
    handler: (payload: M[E]) => void,
  ): (payload: M[E]) => void {
    return (payload: M[E]) => {
      try {
        handler(payload)
      } catch (err) {
        this.emitterLogger?.error(err, 'listener threw')
      }
    }
  }

  private tag<E extends keyof M>(
    handler: (payload: M[E]) => void,
    event: E,
    wrapped: (payload: M[E]) => void,
  ): void {
    const map = this.tagMap(handler)
    map.set(event as string, wrapped as unknown)
  }

  private untag<E extends keyof M>(handler: (payload: M[E]) => void, event: E): void {
    const map = this.tagMap(handler)
    map.delete(event as string)
  }

  private lookup<E extends keyof M>(
    handler: (payload: M[E]) => void,
    event: E,
  ): ((payload: M[E]) => void) | undefined {
    const map = this.tagMap(handler)
    return map.get(event as string) as ((payload: M[E]) => void) | undefined
  }

  private tagMap(handler: object): Map<string, unknown> {
    const sym = TYPED_EE_TAG
    const carrier = handler as { [k: symbol]: Map<string, unknown> | undefined }
    let map = carrier[sym]
    if (!map) {
      map = new Map<string, unknown>()
      carrier[sym] = map
    }
    return map
  }
}

const TYPED_EE_TAG: unique symbol = Symbol('zaileys.typed-ee.tag')
