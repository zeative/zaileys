import { describe, expectTypeOf, it } from 'vitest'
import type {
  ClientEventMap,
  ClientEventName,
  ConnectionEventName,
} from '../../src/client/types.js'
import type { InboundEventName } from '../../src/events/types.js'
import type { MessageContext } from '../../src/events/context.js'

describe('ClientEventMap intersection', () => {
  it('preserves Phase 3 connection event keys', () => {
    expectTypeOf<ClientEventMap['connect']>().toHaveProperty('sessionId').toEqualTypeOf<string>()
    expectTypeOf<ClientEventMap['disconnect']>().toHaveProperty('willReconnect').toEqualTypeOf<boolean>()
    expectTypeOf<ClientEventMap['qr']>().toHaveProperty('qrString').toEqualTypeOf<string>()
    expectTypeOf<ClientEventMap['pairing-code']>().toHaveProperty('code')
    expectTypeOf<ClientEventMap['reconnecting']>().toHaveProperty('attempt')
  })

  it('forwards Phase 9 inbound event keys as MessageContext', () => {
    expectTypeOf<ClientEventMap['text']>().toEqualTypeOf<MessageContext>()
    expectTypeOf<ClientEventMap['image']>().toEqualTypeOf<MessageContext>()
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
