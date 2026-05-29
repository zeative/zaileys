import { describe, expectTypeOf, it } from 'vitest'
import type {
  ClientEventMap,
  ClientEventName,
  ConnectionEventName,
} from '../../src/client/types.js'
import type { InboundEventName, MessagePayload } from '../../src/events/types.js'

describe('ClientEventMap intersection', () => {
  it('preserves Phase 3 connection event keys', () => {
    expectTypeOf<ClientEventMap['connect']>().toHaveProperty('sessionId').toEqualTypeOf<string>()
    expectTypeOf<ClientEventMap['disconnect']>().toHaveProperty('willReconnect').toEqualTypeOf<boolean>()
    expectTypeOf<ClientEventMap['qr']>().toHaveProperty('qrString').toEqualTypeOf<string>()
    expectTypeOf<ClientEventMap['pairing-code']>().toHaveProperty('code')
    expectTypeOf<ClientEventMap['reconnecting']>().toHaveProperty('attempt')
  })

  it('forwards Phase 4 inbound event keys', () => {
    expectTypeOf<ClientEventMap['text']>().toEqualTypeOf<MessagePayload>()
    expectTypeOf<ClientEventMap['image']>().toHaveProperty('media')
    expectTypeOf<ClientEventMap['reaction']>().toHaveProperty('emoji')
  })

  it('ClientEventName unions connection and inbound names', () => {
    expectTypeOf<ConnectionEventName>().toMatchTypeOf<ClientEventName>()
    expectTypeOf<InboundEventName>().toMatchTypeOf<ClientEventName>()
  })

  it('text inbound payload is not any', () => {
    expectTypeOf<ClientEventMap['text']>().not.toBeAny()
  })
})
