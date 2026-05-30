import { describe, expectTypeOf, it } from 'vitest'
import type { MessagePayload, SenderInfo } from '../../src/events/types.js'
import type {
  CommandContext,
  CommandDefinition,
  CommandHandler,
  CommandPrefix,
  Middleware,
  ParsedArgs,
} from '../../src/command/types.js'

describe('command types', () => {
  it('CommandPrefix accepts string or string[]', () => {
    expectTypeOf<string>().toMatchTypeOf<CommandPrefix>()
    expectTypeOf<string[]>().toMatchTypeOf<CommandPrefix>()
  })

  it('ParsedArgs.flags values are string | boolean', () => {
    expectTypeOf<ParsedArgs['flags']>().toEqualTypeOf<Record<string, string | boolean>>()
  })

  it('ParsedArgs.json is unknown', () => {
    expectTypeOf<ParsedArgs['json']>().toEqualTypeOf<unknown>()
  })

  it('CommandContext reuses SenderInfo and MessagePayload', () => {
    expectTypeOf<CommandContext['sender']>().toEqualTypeOf<SenderInfo>()
    expectTypeOf<CommandContext['message']>().toEqualTypeOf<MessagePayload>()
  })

  it('CommandContext.flags value is string | boolean', () => {
    expectTypeOf<CommandContext['flags'][string]>().toEqualTypeOf<string | boolean>()
  })

  it('CommandContext helpers return the expected shapes', () => {
    expectTypeOf<CommandContext['reply']>().returns.resolves.toBeObject()
    expectTypeOf<CommandContext['react']>().returns.resolves.toBeObject()
    expectTypeOf<CommandContext['edit']>().returns.resolves.toBeVoid()
  })

  it('CommandHandler takes a context and returns void or Promise<void>', () => {
    expectTypeOf<CommandHandler>().parameter(0).toEqualTypeOf<CommandContext>()
    expectTypeOf<CommandHandler>().returns.toEqualTypeOf<Promise<void> | void>()
  })

  it('Middleware second param is () => Promise<void>', () => {
    expectTypeOf<Middleware>().parameter(1).toEqualTypeOf<() => Promise<void>>()
  })

  it('CommandDefinition carries name, aliases, parts, handler', () => {
    expectTypeOf<CommandDefinition['name']>().toEqualTypeOf<string>()
    expectTypeOf<CommandDefinition['aliases']>().toEqualTypeOf<string[]>()
    expectTypeOf<CommandDefinition['parts']>().toEqualTypeOf<string[]>()
    expectTypeOf<CommandDefinition['handler']>().toEqualTypeOf<CommandHandler>()
  })
})
