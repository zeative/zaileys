import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandRegistry } from '../../src/command/registry.js'
import { checkGuards, resetCooldowns } from '../../src/command/guards.js'
import type { CommandContext } from '../../src/command/types.js'

const noop = (): void => undefined

const ctxOf = (over: Partial<CommandContext> = {}): CommandContext =>
  ({
    command: 'kick',
    senderId: '628111@s.whatsapp.net',
    roomId: '120@g.us',
    isGroup: true,
    ...over,
  }) as CommandContext

const deps = (isAdmin = true, now = 1_000) => ({
  isAdmin: vi.fn(async () => isAdmin),
  now: () => now,
})

describe('object command spec', () => {
  it('registers the name and aliases like the pipe syntax does', () => {
    const registry = new CommandRegistry()
    registry.register({ name: 'kick', aliases: ['tendang', 'usir'], description: 'Keluarkan' }, noop)
    const def = registry.list()[0]!
    expect(def.name).toBe('kick')
    expect(def.aliases).toEqual(['tendang', 'usir'])
  })

  it('resolves a call made through an alias', () => {
    const registry = new CommandRegistry()
    registry.register({ name: 'kick', aliases: ['tendang'] }, noop)
    const hit = registry.resolve({ matched: true, name: 'tendang', args: [], flags: {}, json: null, raw: '' })
    expect(hit?.def.name).toBe('kick')
  })

  it('keeps the metadata for building a menu', () => {
    const registry = new CommandRegistry()
    registry.register(
      {
        name: 'kick',
        description: 'Keluarkan anggota',
        usage: '<@user>',
        category: 'group',
        admin: true,
        cooldown: 5,
        metadata: { premium: true },
      },
      noop,
    )
    expect(registry.describe()[0]).toEqual({
      name: 'kick',
      aliases: [],
      description: 'Keluarkan anggota',
      usage: '<@user>',
      category: 'group',
      admin: true,
      cooldown: 5,
      metadata: { premium: true },
    })
  })

  it('leaves a string spec free of metadata', () => {
    const registry = new CommandRegistry()
    registry.register('ping', noop)
    expect(registry.describe()[0]).toEqual({ name: 'ping', aliases: [] })
  })

  it('unregisters by object spec too', () => {
    const registry = new CommandRegistry()
    registry.register({ name: 'kick', aliases: ['tendang'] }, noop)
    registry.unregister({ name: 'kick', aliases: ['tendang'] })
    expect(registry.list()).toHaveLength(0)
  })
})

describe('guards', () => {
  beforeEach(() => resetCooldowns())

  it('lets an unguarded command through', async () => {
    expect(await checkGuards({}, ctxOf(), deps())).toBeNull()
  })

  it('blocks a group-only command in a private chat', async () => {
    const block = await checkGuards({ group: true }, ctxOf({ isGroup: false }), deps())
    expect(block).toEqual({ reason: 'group-only' })
  })

  it('blocks a private-only command inside a group', async () => {
    const block = await checkGuards({ private: true }, ctxOf(), deps())
    expect(block).toEqual({ reason: 'private-only' })
  })

  it('treats admin as implying group', async () => {
    const block = await checkGuards({ admin: true }, ctxOf({ isGroup: false }), deps())
    expect(block).toEqual({ reason: 'group-only' })
  })

  it('lets a group admin through', async () => {
    const d = deps(true)
    expect(await checkGuards({ admin: true }, ctxOf(), d)).toBeNull()
    expect(d.isAdmin).toHaveBeenCalledWith('120@g.us', '628111@s.whatsapp.net')
  })

  it('blocks a member who is not an admin', async () => {
    const block = await checkGuards({ admin: true }, ctxOf(), deps(false))
    expect(block).toEqual({ reason: 'admin-only' })
  })

  it('blocks a repeat call inside the cooldown and reports the wait', async () => {
    expect(await checkGuards({ cooldown: 10 }, ctxOf(), deps(true, 1_000))).toBeNull()
    const block = await checkGuards({ cooldown: 10 }, ctxOf(), deps(true, 4_000))
    expect(block).toEqual({ reason: 'cooldown', retryIn: 7 })
  })

  it('allows the call again once the cooldown has passed', async () => {
    await checkGuards({ cooldown: 10 }, ctxOf(), deps(true, 1_000))
    expect(await checkGuards({ cooldown: 10 }, ctxOf(), deps(true, 12_000))).toBeNull()
  })

  it('tracks the cooldown per sender, not globally', async () => {
    await checkGuards({ cooldown: 10 }, ctxOf(), deps(true, 1_000))
    const other = ctxOf({ senderId: '628999@s.whatsapp.net' })
    expect(await checkGuards({ cooldown: 10 }, other, deps(true, 2_000))).toBeNull()
  })

  it('does not start a cooldown for a call that was blocked anyway', async () => {
    await checkGuards({ admin: true, cooldown: 10 }, ctxOf(), deps(false, 1_000))
    expect(await checkGuards({ cooldown: 10 }, ctxOf(), deps(true, 1_500))).toBeNull()
  })
})
