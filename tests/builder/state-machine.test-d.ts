import type { WAMessageKey } from 'baileys'
import { describe, expectTypeOf, it } from 'vitest'
import type { MessageBuilder } from '../../src/builder/builder.js'

type InitB = MessageBuilder<'init'>
type SetB = MessageBuilder<'content-set'>

type ContentReturn = ReturnType<InitB['text']>
type ReplyReturn = ReturnType<InitB['reply']>
type MentionAllInit = ReturnType<InitB['mentionAll']>
type MentionAllSet = ReturnType<SetB['mentionAll']>

type ThisParamOf<F> = F extends (this: infer T, ...args: infer _A) => infer _R ? T : never

describe('MessageBuilder compile-time state machine', () => {
  it('content method transitions init -> content-set', () => {
    expectTypeOf<ContentReturn>().toEqualTypeOf<SetB>()
    expectTypeOf<ReturnType<InitB['image']>>().toEqualTypeOf<SetB>()
  })

  it('context modifiers preserve state', () => {
    expectTypeOf<ReplyReturn>().toEqualTypeOf<InitB>()
    expectTypeOf<MentionAllInit>().toEqualTypeOf<InitB>()
    expectTypeOf<ReturnType<InitB['mentions']>>().toEqualTypeOf<InitB>()
    expectTypeOf<ReturnType<InitB['disappearing']>>().toEqualTypeOf<InitB>()
    expectTypeOf<MentionAllSet>().toEqualTypeOf<SetB>()
  })

  it('single-content invariant: content methods require an init receiver', () => {
    expectTypeOf<ThisParamOf<InitB['text']>>().toEqualTypeOf<InitB>()
    expectTypeOf<ThisParamOf<InitB['image']>>().toEqualTypeOf<InitB>()
    expectTypeOf<ThisParamOf<InitB['album']>>().toEqualTypeOf<InitB>()
  })

  it('single-content invariant: text() after text() is a type error', () => {
    const _check = (set: SetB) => {
      // @ts-expect-error content-set builders cannot set content again
      set.text('again')
    }
    expectTypeOf(_check).toBeFunction()
  })

  it('single-content invariant: image() after text() is a type error', () => {
    const _check = (set: SetB) => {
      // @ts-expect-error content-set builders cannot set a second content kind
      set.image('a.png')
    }
    expectTypeOf(_check).toBeFunction()
  })

  it('await guard: then() requires a content-set receiver', () => {
    expectTypeOf<ThisParamOf<SetB['then']>>().toEqualTypeOf<SetB>()
  })

  it('await guard: awaiting an init builder is a type error', () => {
    const _check = async (init: InitB) => {
      // @ts-expect-error then() is receiver-typed to content-set only
      await init
    }
    expectTypeOf(_check).toBeFunction()
  })

  it('then() resolves to WAMessageKey by default', () => {
    expectTypeOf<ReturnType<SetB['then']>>().resolves.toEqualTypeOf<WAMessageKey>()
  })
})
