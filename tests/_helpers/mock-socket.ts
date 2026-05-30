import { EventEmitter } from 'node:events'
import { vi, type Mock } from 'vitest'

export interface MockSocketUser {
  id: string
  lid?: string
  name?: string
}

export interface MockSocket {
  ev: EventEmitter
  user: MockSocketUser | undefined
  authState: { creds: unknown; keys: unknown }
  end: Mock
  logout: Mock
  requestPairingCode: Mock
  sendMessage: Mock
  onWhatsApp: Mock
  triggerConnectionUpdate(update: Record<string, unknown>): void
  triggerCredsUpdate(creds: unknown): void
  setUser(user: MockSocketUser): void
}

export function createMockSocket(initial?: { user?: MockSocketUser }): MockSocket {
  const ev = new EventEmitter()
  ev.setMaxListeners(0)
  const socket: MockSocket = {
    ev,
    user: initial?.user,
    authState: { creds: {}, keys: {} },
    end: vi.fn((_err?: Error) => undefined),
    logout: vi.fn(async () => undefined),
    requestPairingCode: vi.fn(async (_phone: string) => 'MOCKCODE'),
    sendMessage: vi.fn(async (_jid: string, _content: unknown, _options?: unknown) => ({
      key: { remoteJid: _jid, id: 'mock-sent-id', fromMe: true },
    })),
    onWhatsApp: vi.fn(async (..._phoneNumber: string[]) => undefined),
    triggerConnectionUpdate(update) {
      ev.emit('connection.update', update)
    },
    triggerCredsUpdate(creds) {
      ev.emit('creds.update', creds)
    },
    setUser(user) {
      socket.user = user
    },
  }
  return socket
}
