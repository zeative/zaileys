import type { WAMessageKey } from 'baileys'
import { describe, expectTypeOf, it } from 'vitest'
import type { MessageBuilder } from '../../src/builder/builder.js'

type InitB = MessageBuilder<'init'>
type SetB = MessageBuilder<'content-set'>

describe('[SC-1] chain is fully type-safe', () => {
  it('[SC-1] text() transitions init -> content-set', () => {
    expectTypeOf<ReturnType<InitB['text']>>().toEqualTypeOf<SetB>()
  })

  it('[SC-1] awaiting a content-set chain resolves to WAMessageKey', () => {
    expectTypeOf<ReturnType<SetB['then']>>().resolves.toEqualTypeOf<WAMessageKey>()
  })

  it('[SC-1] reply() and mentions() preserve the chain state', () => {
    expectTypeOf<ReturnType<InitB['reply']>>().toEqualTypeOf<InitB>()
    expectTypeOf<ReturnType<InitB['mentions']>>().toEqualTypeOf<InitB>()
  })

  it('[SC-1] .image() after .text() is a compile error', () => {
    const _check = (set: SetB) => {
      // @ts-expect-error content-set builders cannot set a second content kind
      set.image('b.jpg')
    }
    expectTypeOf(_check).toBeFunction()
  })

  it('[SC-1] awaiting an init builder (no content) is a compile error', () => {
    const _check = async (init: InitB) => {
      // @ts-expect-error then() is receiver-typed to content-set only
      await init
    }
    expectTypeOf(_check).toBeFunction()
  })
})
