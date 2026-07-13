import { describe, expect, it } from 'vitest'
import type { WASocket } from 'baileys'
import type { Transport } from '../../src/transport/types.js'
import { Client } from '../../src/client/client.js'

/** Compile-time: raw baileys socket must satisfy the Transport seam structurally. */
type AssertAssignable<A extends B, B> = A
type _BaileysSatisfiesTransport = AssertAssignable<WASocket, Transport>

describe('transport seam', () => {
  it('baileys socket type satisfies Transport (compile-time)', () => {
    const witness: _BaileysSatisfiesTransport | undefined = undefined
    expect(witness).toBeUndefined()
  })

  it('send() before connect on cloud throws NOT_CONNECTED-style error', () => {
    const c = new Client({
      provider: 'cloud',
      cloud: { accessToken: 'tok', phoneNumberId: '123' },
      autoConnect: false,
    })
    expect(() => c.send('628111')).toThrowError()
  })
})
