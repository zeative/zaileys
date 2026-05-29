import type { ConnectionState } from '../client/types.js'

/** Listener notified after a successful state transition. */
export type StateTransitionListener = (prev: ConnectionState, next: ConnectionState) => void

/** Hand-rolled typed FSM driving Client connection lifecycle. */
export interface ConnectionStateMachine {
  readonly state: ConnectionState
  canTransition(next: ConnectionState): boolean
  transition(next: ConnectionState): void
  onChange(listener: StateTransitionListener): () => void
}

const TRANSITIONS: Readonly<Record<ConnectionState, ReadonlyArray<ConnectionState>>> = {
  idle: ['connecting'],
  connecting: ['qr-pending', 'pairing-pending', 'connected', 'reconnecting', 'disconnecting', 'disconnected'],
  'qr-pending': ['connecting', 'connected', 'disconnecting', 'disconnected'],
  'pairing-pending': ['connecting', 'connected', 'disconnecting', 'disconnected'],
  connected: ['disconnecting', 'reconnecting', 'disconnected'],
  reconnecting: ['connecting', 'disconnecting', 'disconnected'],
  disconnecting: ['disconnected'],
  disconnected: ['idle', 'connecting', 'reconnecting'],
}

/**
 * Construct a fresh state machine starting at `initial` (default `'idle'`).
 * Synchronous and free of timers; invalid transitions throw with a message
 * containing both the source and target state.
 */
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
