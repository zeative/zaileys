import { describe, expect, it, vi } from 'vitest'
import {
  ConversationRegistry,
  DEFAULT_WAIT_TIMEOUT_MS,
  isConversationEnd,
  type ConversationTimer,
} from '../../src/command/conversation.js'
import { ZaileysCommandError } from '../../src/command/errors.js'
import type { MessageContext } from '../../src/events/context.js'
import { MAX_TIMER_DELAY_MS } from '../../src/utils/timer.js'

const ALICE = '628222@s.whatsapp.net'
const ALICE_LID = '99887766@lid'
const BOB = '628333@s.whatsapp.net'
const BOT = '628111@s.whatsapp.net'
const GROUP = '120363000000000001@g.us'

const msg = (over: Partial<MessageContext> = {}): MessageContext =>
  ({
    uniqueId: 'u',
    staticId: 's',
    channelId: '',
    chatId: 'M1',
    chatType: 'text',
    receiverId: BOT,
    roomId: ALICE,
    senderId: ALICE,
    senderLid: null,
    senderName: null,
    senderUsername: null,
    senderDevice: 'unknown',
    timestamp: 0,
    text: 'hello',
    mentions: [],
    links: [],
    isFromMe: false,
    verified: true,
    isGroup: false,
    isNewsletter: false,
    isBroadcast: false,
    isViewOnce: false,
    isEphemeral: false,
    isForwarded: false,
    isOld: false,
    isQuestion: false,
    isPrefix: false,
    isTagMe: false,
    isEdited: false,
    isDeleted: false,
    isPinned: false,
    isUnPinned: false,
    isBot: false,
    isSpam: false,
    isHideTags: false,
    isStatusMention: false,
    isGroupStatusMention: false,
    isGroupStatus: false,
    isStory: false,
    forwardCount: 0,
    ephemeralDuration: null,
    addressingMode: 'pn',
    mentionedGroups: [],
    ...over,
  }) as MessageContext

const fakeClock = () => {
  let now = 0
  let seq = 0
  const timers = new Map<number, { at: number; cb: () => void }>()
  const timer: ConversationTimer = {
    set: (cb, ms) => {
      seq += 1
      timers.set(seq, { at: now + ms, cb })
      return seq
    },
    clear: (handle) => {
      timers.delete(handle as number)
    },
  }
  const advance = (ms: number): void => {
    now += ms
    for (;;) {
      const due = [...timers].find(([, t]) => t.at <= now)
      if (due === undefined) return
      timers.delete(due[0])
      due[1].cb()
    }
  }
  return { now: () => now, timer, advance, active: () => timers.size }
}

const setup = (maxPending?: number) => {
  const clock = fakeClock()
  const registry = new ConversationRegistry({
    now: clock.now,
    timer: clock.timer,
    ...(maxPending === undefined ? {} : { maxPending }),
  })
  return { clock, registry }
}

const codeOf = async (promise: Promise<unknown>): Promise<string | undefined> => {
  try {
    await promise
    return undefined
  } catch (err) {
    return (err as ZaileysCommandError).code
  }
}

/** Lets a wait's rejection or resolution settle before asserting on a flag. */
const track = (promise: Promise<MessageContext>) => {
  const state: { value?: MessageContext; error?: unknown; settled: boolean } = { settled: false }
  promise.then(
    (value) => Object.assign(state, { value, settled: true }),
    (error: unknown) => Object.assign(state, { error, settled: true }),
  )
  return state
}

const flush = () => new Promise<void>((r) => queueMicrotask(r))

describe('ConversationRegistry — resolve', () => {
  it('resolves with the next message in the chat from the sender', async () => {
    const { registry, clock } = setup()
    const wait = registry.wait({ chat: ALICE, from: ALICE })
    const answer = msg({ text: 'Budi' })
    expect(registry.offer(answer)).toBe(true)
    await expect(wait).resolves.toBe(answer)
    expect(registry.size).toBe(0)
    expect(clock.active()).toBe(0)
  })

  it('ignores a message in another chat', async () => {
    const { registry } = setup()
    const state = track(registry.wait({ chat: GROUP, from: ALICE }))
    expect(registry.offer(msg({ roomId: ALICE }))).toBe(false)
    await flush()
    expect(state.settled).toBe(false)
    expect(registry.size).toBe(1)
  })

  it('ignores another sender in the same group when from is given', async () => {
    const { registry } = setup()
    const wait = registry.wait({ chat: GROUP, from: ALICE })
    expect(registry.offer(msg({ roomId: GROUP, isGroup: true, senderId: BOB }))).toBe(false)
    const answer = msg({ roomId: GROUP, isGroup: true, senderId: ALICE })
    expect(registry.offer(answer)).toBe(true)
    await expect(wait).resolves.toBe(answer)
  })

  it('accepts any sender in the chat when from is omitted', async () => {
    const { registry } = setup()
    const wait = registry.wait({ chat: GROUP })
    const answer = msg({ roomId: GROUP, isGroup: true, senderId: BOB })
    expect(registry.offer(answer)).toBe(true)
    await expect(wait).resolves.toBe(answer)
  })

  it('matches a sender JID that carries a device suffix', async () => {
    const { registry } = setup()
    const wait = registry.wait({ chat: ALICE, from: '628222:7@s.whatsapp.net' })
    const answer = msg()
    expect(registry.offer(answer)).toBe(true)
    await expect(wait).resolves.toBe(answer)
  })

  it('does not count a message offered before the wait started', async () => {
    const { registry } = setup()
    const early = msg()
    expect(registry.offer(early)).toBe(false)
    const state = track(registry.wait({ chat: ALICE, from: ALICE }))
    expect(registry.offer(early)).toBe(false)
    await flush()
    expect(state.settled).toBe(false)
  })

  it('returns the first outcome when the same message is offered twice', () => {
    const { registry } = setup()
    void registry.wait({ chat: ALICE, from: ALICE })
    const answer = msg()
    expect(registry.offer(answer)).toBe(true)
    expect(registry.offer(answer)).toBe(true)
  })

  it('ignores history, edits, deletes and status posts', async () => {
    const { registry } = setup()
    const state = track(registry.wait({ chat: ALICE, from: ALICE }))
    expect(registry.offer(msg({ isOld: true }))).toBe(false)
    expect(registry.offer(msg({ isEdited: true }))).toBe(false)
    expect(registry.offer(msg({ isDeleted: true }))).toBe(false)
    expect(registry.offer(msg({ isStory: true }))).toBe(false)
    await flush()
    expect(state.settled).toBe(false)
  })
})

describe('ConversationRegistry — LID and PN identities', () => {
  it('matches from given as a LID against the message senderLid', async () => {
    const { registry } = setup()
    const wait = registry.wait({ chat: GROUP, from: ALICE_LID })
    const answer = msg({ roomId: GROUP, isGroup: true, senderId: ALICE, senderLid: ALICE_LID })
    expect(registry.offer(answer)).toBe(true)
    await expect(wait).resolves.toBe(answer)
  })

  it('matches a one-to-one chat named by LID after the sender resolved to a PN', async () => {
    const { registry } = setup()
    const wait = registry.wait({ chat: ALICE_LID, from: ALICE_LID })
    const answer = msg({ roomId: ALICE, senderId: ALICE, senderLid: ALICE_LID })
    expect(registry.offer(answer)).toBe(true)
    await expect(wait).resolves.toBe(answer)
  })

  it('never matches a LID against a PN with the same digits', async () => {
    const { registry } = setup()
    const state = track(registry.wait({ chat: ALICE, from: '628222@lid' }))
    expect(registry.offer(msg())).toBe(false)
    await flush()
    expect(state.settled).toBe(false)
  })
})

describe('ConversationRegistry — own messages', () => {
  it('ignores the bot’s own message when from is omitted', async () => {
    const { registry } = setup()
    const state = track(registry.wait({ chat: ALICE }))
    expect(registry.offer(msg({ isFromMe: true, senderId: BOT }))).toBe(false)
    await flush()
    expect(state.settled).toBe(false)
  })

  it('accepts the bot’s own message when from is the bot', async () => {
    const { registry } = setup()
    const wait = registry.wait({ chat: ALICE, from: BOT })
    const own = msg({ isFromMe: true, senderId: BOT })
    expect(registry.offer(own)).toBe(true)
    await expect(wait).resolves.toBe(own)
  })
})

describe('ConversationRegistry — filter', () => {
  it('keeps waiting past a message the filter rejects', async () => {
    const { registry } = setup()
    const wait = registry.wait({ chat: ALICE, from: ALICE, filter: (m) => /^\d+$/.test(m.text) })
    expect(registry.offer(msg({ text: 'twenty' }))).toBe(false)
    const answer = msg({ text: '20' })
    expect(registry.offer(answer)).toBe(true)
    await expect(wait).resolves.toBe(answer)
  })

  it('rejects the wait with the error a filter throws', async () => {
    const { registry, clock } = setup()
    const boom = new Error('bad filter')
    const wait = registry.wait({
      chat: ALICE,
      filter: () => {
        throw boom
      },
    })
    expect(registry.offer(msg())).toBe(false)
    await expect(wait).rejects.toBe(boom)
    expect(clock.active()).toBe(0)
  })
})

describe('ConversationRegistry — timeout', () => {
  it('rejects ASK_TIMEOUT after the default 60 seconds', async () => {
    const { registry, clock } = setup()
    const state = track(registry.wait({ chat: ALICE, from: ALICE }))
    clock.advance(DEFAULT_WAIT_TIMEOUT_MS - 1)
    await flush()
    expect(state.settled).toBe(false)
    clock.advance(1)
    await flush()
    expect((state.error as ZaileysCommandError).code).toBe('ASK_TIMEOUT')
    expect(registry.size).toBe(0)
  })

  it('honours a custom timeout', async () => {
    const { registry, clock } = setup()
    const wait = registry.wait({ chat: ALICE, timeout: 5000 })
    clock.advance(5000)
    expect(await codeOf(wait)).toBe('ASK_TIMEOUT')
  })

  it('re-arms a timeout longer than the Node timer limit instead of firing early', async () => {
    const { registry, clock } = setup()
    const state = track(registry.wait({ chat: ALICE, timeout: MAX_TIMER_DELAY_MS + 10 }))
    clock.advance(MAX_TIMER_DELAY_MS)
    await flush()
    expect(state.settled).toBe(false)
    expect(clock.active()).toBe(1)
    clock.advance(10)
    await flush()
    expect((state.error as ZaileysCommandError).code).toBe('ASK_TIMEOUT')
  })

  it('clears the timer once the wait resolves', async () => {
    const { registry, clock } = setup()
    const wait = registry.wait({ chat: ALICE })
    registry.offer(msg())
    await wait
    expect(clock.active()).toBe(0)
  })
})

describe('ConversationRegistry — supersede and limit', () => {
  it('cancels the older wait for the same chat and sender', async () => {
    const { registry } = setup()
    const first = registry.wait({ chat: ALICE, from: ALICE })
    const second = registry.wait({ chat: ALICE, from: '628222:3@s.whatsapp.net' })
    expect(await codeOf(first)).toBe('ASK_CANCELLED')
    const answer = msg()
    registry.offer(answer)
    await expect(second).resolves.toBe(answer)
  })

  it('keeps waits for different senders in the same chat apart', async () => {
    const { registry } = setup()
    void registry.wait({ chat: GROUP, from: ALICE })
    void registry.wait({ chat: GROUP, from: BOB })
    void registry.wait({ chat: GROUP })
    expect(registry.size).toBe(3)
  })

  it('rejects ASK_LIMIT once maxPending waits are pending', async () => {
    const { registry } = setup(2)
    void registry.wait({ chat: ALICE })
    void registry.wait({ chat: BOB })
    expect(await codeOf(registry.wait({ chat: GROUP }))).toBe('ASK_LIMIT')
    expect(registry.size).toBe(2)
  })

  it('lets a superseding wait take the freed slot at the limit', async () => {
    const { registry } = setup(1)
    const first = registry.wait({ chat: ALICE })
    const second = track(registry.wait({ chat: ALICE }))
    expect(await codeOf(first)).toBe('ASK_CANCELLED')
    await flush()
    expect(second.settled).toBe(false)
    expect(registry.size).toBe(1)
  })

  it('defaults to 1000 pending waits', async () => {
    const registry = new ConversationRegistry({ timer: { set: () => 0, clear: () => undefined } })
    for (let i = 0; i < 1000; i++) void registry.wait({ chat: `62800${i}@s.whatsapp.net` })
    expect(await codeOf(registry.wait({ chat: GROUP }))).toBe('ASK_LIMIT')
  })

  it('throws INVALID_OPTIONS for a maxPending that is not a positive integer', () => {
    expect(() => new ConversationRegistry({ maxPending: 0 })).toThrow(
      expect.objectContaining({ code: 'INVALID_OPTIONS' }),
    )
  })
})

describe('ConversationRegistry — abort signal', () => {
  it('rejects ASK_CANCELLED when the signal aborts', async () => {
    const { registry, clock } = setup()
    const controller = new AbortController()
    const wait = registry.wait({ chat: ALICE, signal: controller.signal })
    controller.abort()
    expect(await codeOf(wait)).toBe('ASK_CANCELLED')
    expect(clock.active()).toBe(0)
    expect(registry.size).toBe(0)
  })

  it('rejects ASK_CANCELLED at once for an already aborted signal', async () => {
    const { registry } = setup()
    expect(await codeOf(registry.wait({ chat: ALICE, signal: AbortSignal.abort() }))).toBe('ASK_CANCELLED')
    expect(registry.size).toBe(0)
  })

  it('removes its abort listener once settled', async () => {
    const { registry } = setup()
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    const wait = registry.wait({ chat: ALICE, signal: controller.signal })
    registry.offer(msg())
    await wait
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
  })
})

describe('ConversationRegistry — cancelAll', () => {
  it('rejects every pending wait with ASK_CANCELLED and clears its timers', async () => {
    const { registry, clock } = setup()
    const a = registry.wait({ chat: ALICE })
    const b = registry.wait({ chat: GROUP, from: BOB })
    registry.cancelAll()
    expect(await codeOf(a)).toBe('ASK_CANCELLED')
    expect(await codeOf(b)).toBe('ASK_CANCELLED')
    expect(registry.size).toBe(0)
    expect(clock.active()).toBe(0)
  })
})

describe('ConversationRegistry — validation', () => {
  it('rejects INVALID_OPTIONS for a chat that is not a JID', async () => {
    const { registry } = setup()
    expect(await codeOf(registry.wait({ chat: '628222' }))).toBe('INVALID_OPTIONS')
    expect(await codeOf(registry.wait({ chat: '' }))).toBe('INVALID_OPTIONS')
  })

  it('rejects INVALID_OPTIONS for a from that is not a JID', async () => {
    const { registry } = setup()
    expect(await codeOf(registry.wait({ chat: ALICE, from: 'alice' }))).toBe('INVALID_OPTIONS')
  })

  it('rejects INVALID_OPTIONS for a timeout that is not positive', async () => {
    const { registry } = setup()
    expect(await codeOf(registry.wait({ chat: ALICE, timeout: 0 }))).toBe('INVALID_OPTIONS')
    expect(await codeOf(registry.wait({ chat: ALICE, timeout: Number.NaN }))).toBe('INVALID_OPTIONS')
    expect(registry.size).toBe(0)
  })
})

describe('isConversationEnd', () => {
  it('is true only for ASK_TIMEOUT and ASK_CANCELLED', () => {
    expect(isConversationEnd(new ZaileysCommandError('ASK_TIMEOUT', 'x'))).toBe(true)
    expect(isConversationEnd(new ZaileysCommandError('ASK_CANCELLED', 'x'))).toBe(true)
    expect(isConversationEnd(new ZaileysCommandError('ASK_LIMIT', 'x'))).toBe(false)
    expect(isConversationEnd(new Error('ASK_TIMEOUT'))).toBe(false)
  })
})
