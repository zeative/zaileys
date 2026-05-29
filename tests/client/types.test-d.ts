import { describe, expectTypeOf, it } from 'vitest'
import type {
  BaileysSocket,
  ClientOptions,
  ConnectionAuthType,
  ConnectionEventHandler,
  ConnectionEventMap,
  ConnectionEventName,
  ConnectionState,
  Logger,
  ReconnectOptions,
} from '../../src/client/types.js'
import type { DisconnectReasonDomain } from '../../src/connection/disconnect-reason.js'

describe('ClientOptions', () => {
  it('sessionId is optional string', () => {
    expectTypeOf<ClientOptions>().toHaveProperty('sessionId').toEqualTypeOf<string | undefined>()
  })

  it('authType narrows to qr | pairing', () => {
    expectTypeOf<ClientOptions>().toHaveProperty('authType').toEqualTypeOf<ConnectionAuthType | undefined>()
    expectTypeOf<ConnectionAuthType>().toEqualTypeOf<'qr' | 'pairing'>()
  })

  it('reconnect uses ReconnectOptions shape', () => {
    expectTypeOf<ClientOptions>().toHaveProperty('reconnect').toEqualTypeOf<ReconnectOptions | undefined>()
  })

  it('logger conforms to Logger shape', () => {
    expectTypeOf<ClientOptions>().toHaveProperty('logger').toEqualTypeOf<Logger | undefined>()
  })

  it('baileys is partial UserFacingSocketConfig', () => {
    expectTypeOf<ClientOptions>().toHaveProperty('baileys')
  })
})

describe('ConnectionEventMap', () => {
  it('connect payload exposes sessionId + me.id', () => {
    expectTypeOf<ConnectionEventMap['connect']>().toHaveProperty('sessionId').toEqualTypeOf<string>()
    expectTypeOf<ConnectionEventMap['connect']['me']>().toHaveProperty('id').toEqualTypeOf<string>()
  })

  it('disconnect reason is DisconnectReasonDomain, not any', () => {
    expectTypeOf<ConnectionEventMap['disconnect']['reason']>().not.toBeAny()
    expectTypeOf<ConnectionEventMap['disconnect']['reason']>().toEqualTypeOf<DisconnectReasonDomain>()
    expectTypeOf<ConnectionEventMap['disconnect']['willReconnect']>().toEqualTypeOf<boolean>()
  })

  it('qr carries qrString + expiresAt', () => {
    expectTypeOf<ConnectionEventMap['qr']['qrString']>().toEqualTypeOf<string>()
    expectTypeOf<ConnectionEventMap['qr']['expiresAt']>().toEqualTypeOf<number>()
  })

  it('pairing-code carries code + expiresAt', () => {
    expectTypeOf<ConnectionEventMap['pairing-code']['code']>().toEqualTypeOf<string>()
    expectTypeOf<ConnectionEventMap['pairing-code']['expiresAt']>().toEqualTypeOf<number>()
  })

  it('reconnecting carries attempt + delayMs + reason', () => {
    expectTypeOf<ConnectionEventMap['reconnecting']['attempt']>().toEqualTypeOf<number>()
    expectTypeOf<ConnectionEventMap['reconnecting']['delayMs']>().toEqualTypeOf<number>()
    expectTypeOf<ConnectionEventMap['reconnecting']['reason']>().toEqualTypeOf<DisconnectReasonDomain>()
  })

  it('ConnectionEventName enumerates exactly 5 events', () => {
    expectTypeOf<ConnectionEventName>().toEqualTypeOf<
      'connect' | 'disconnect' | 'qr' | 'pairing-code' | 'reconnecting'
    >()
  })

  it('ConnectionEventHandler binds to mapped payload', () => {
    expectTypeOf<ConnectionEventHandler<'connect'>>().parameter(0).toEqualTypeOf<ConnectionEventMap['connect']>()
    expectTypeOf<ConnectionEventHandler<'disconnect'>>().parameter(0).toEqualTypeOf<ConnectionEventMap['disconnect']>()
  })
})

describe('ConnectionState', () => {
  it('enumerates exactly 8 states', () => {
    expectTypeOf<ConnectionState>().toEqualTypeOf<
      | 'idle'
      | 'connecting'
      | 'qr-pending'
      | 'pairing-pending'
      | 'connected'
      | 'reconnecting'
      | 'disconnecting'
      | 'disconnected'
    >()
  })
})

describe('BaileysSocket', () => {
  it('is exported as a type alias', () => {
    expectTypeOf<BaileysSocket>().not.toBeAny()
  })
})
