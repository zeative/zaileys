import type { ConnectionState } from '../client/types.js'

export type StateTransitionListener = (prev: ConnectionState, next: ConnectionState) => void

export interface ConnectionStateMachine {
  readonly state: ConnectionState
  canTransition(next: ConnectionState): boolean
  transition(next: ConnectionState): void
  onChange(listener: StateTransitionListener): () => void
}

const TRANSITIONS: Readonly<Record<ConnectionState, ReadonlyArray<ConnectionState>>> = {
  idle: ['connecting'],
  connecting: ['qr-pending', 'pairing-pending', 'connected', 'reconnecting', 'disconnecting', 'disconnected'],
  'qr-pending': ['connecting', 'connected', 'reconnecting', 'disconnecting', 'disconnected'],
  'pairing-pending': ['connecting', 'connected', 'reconnecting', 'disconnecting', 'disconnected'],
  connected: ['disconnecting', 'reconnecting', 'disconnected'],
  reconnecting: ['connecting', 'disconnecting', 'disconnected'],
  disconnecting: ['disconnected'],
  disconnected: ['idle', 'connecting', 'reconnecting'],
}

export function createConnectionStateMachine(initial: ConnectionState = 'idle'): ConnectionStateMachine {
  let current: ConnectionState = initial
  const listeners = new Set<StateTransitionListener>()

  const canTransition = (next: ConnectionState): boolean => TRANSITIONS[current].includes(next)

  return {
    get state() {
      return current
    },
    canTransition,
    transition(next: ConnectionState): void {
      if (!canTransition(next)) {
        throw new Error(`invalid state transition: ${current} -> ${next}`)
      }
      const prev = current
      current = next
      for (const listener of listeners) {
        try {
          listener(prev, next)
        } catch {
          void 0
        }
      }
    },
    onChange(listener: StateTransitionListener): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
