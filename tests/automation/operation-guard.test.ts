import { describe, expect, it, vi } from 'vitest'
import {
  createOperationGuard,
  type OperationCategory,
  type OperationGuard,
} from '../../src/automation/operation-guard.js'
import { GroupModule } from '../../src/domain/group.js'
import { CommunityModule } from '../../src/domain/community.js'
import type { DomainSocketLike } from '../../src/domain/socket-like.js'

function controllableClock() {
  let t = 0
  const sleep = vi.fn(async (ms: number) => {
    t += ms
  })
  return { now: () => t, sleep, advance: (ms: number) => (t += ms), at: () => t }
}

describe('createOperationGuard — spacing', () => {
  it('first call in a category runs immediately', async () => {
    const clock = controllableClock()
    const g = createOperationGuard({ intervalsMs: { 'group.create': 1000 } }, clock)
    await g.run('group.create', async () => 'ok')
    expect(clock.sleep).not.toHaveBeenCalled()
  })

  it('second call within the interval waits the remaining time', async () => {
    const clock = controllableClock()
    const g = createOperationGuard({ intervalsMs: { 'group.create': 1000 } }, clock)
    await g.run('group.create', async () => 1)
    await g.run('group.create', async () => 2)
    expect(clock.sleep).toHaveBeenCalledWith(1000)
  })

  it('a call after the interval has elapsed does not wait', async () => {
    const clock = controllableClock()
    const g = createOperationGuard({ intervalsMs: { 'group.join': 500 } }, clock)
    await g.run('group.join', async () => 1)
    clock.advance(500)
    await g.run('group.join', async () => 2)
    expect(clock.sleep).not.toHaveBeenCalled()
  })

  it('different categories are throttled independently', async () => {
    const clock = controllableClock()
    const g = createOperationGuard(
      { intervalsMs: { 'group.create': 1000, 'community.create': 2000 } },
      clock,
    )
    await g.run('group.create', async () => 1)
    await g.run('community.create', async () => 2)
    expect(clock.sleep).not.toHaveBeenCalled()
  })

  it('uses built-in defaults when no override is given (community.create = 120s)', async () => {
    const clock = controllableClock()
    const g = createOperationGuard({}, clock)
    await g.run('community.create', async () => 1)
    await g.run('community.create', async () => 2)
    expect(clock.sleep).toHaveBeenCalledWith(120_000)
  })
})

describe('createOperationGuard — serialization', () => {
  it('runs same-category operations in submission order', async () => {
    const clock = controllableClock()
    const g = createOperationGuard({ intervalsMs: { 'group.participants': 0 } }, clock)
    const order: number[] = []
    const a = g.run('group.participants', async () => {
      order.push(1)
    })
    const b = g.run('group.participants', async () => {
      order.push(2)
    })
    await Promise.all([a, b])
    expect(order).toEqual([1, 2])
  })

  it('a throwing operation does not stall the category chain', async () => {
    const clock = controllableClock()
    const g = createOperationGuard({ intervalsMs: { 'group.update': 0 } }, clock)
    await expect(g.run('group.update', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    await expect(g.run('group.update', async () => 'recovered')).resolves.toBe('recovered')
  })
})

describe('domain modules route through the guard', () => {
  const recordingGuard = (): { guard: OperationGuard; categories: OperationCategory[] } => {
    const categories: OperationCategory[] = []
    const guard: OperationGuard = {
      run: <T>(category: OperationCategory, op: () => Promise<T>): Promise<T> => {
        categories.push(category)
        return op()
      },
    }
    return { guard, categories }
  }

  const fakeSocket = (): DomainSocketLike =>
    ({
      groupCreate: vi.fn(async () => ({ id: '1@g.us' })),
      groupParticipantsUpdate: vi.fn(async () => []),
      groupAcceptInvite: vi.fn(async () => '1@g.us'),
      communityCreate: vi.fn(async () => ({ id: 'c@g.us' })),
      communityAcceptInvite: vi.fn(async () => 'c@g.us'),
    }) as unknown as DomainSocketLike

  it('GroupModule.create -> group.create, participant ops -> group.participants, accept -> group.join', async () => {
    const { guard, categories } = recordingGuard()
    const socket = fakeSocket()
    const group = new GroupModule(() => socket, guard)
    await group.create('g', [])
    await group.addMember('1@g.us', ['x'])
    await group.acceptInvite('code')
    expect(categories).toEqual(['group.create', 'group.participants', 'group.join'])
  })

  it('CommunityModule.create -> community.create, accept -> community.join', async () => {
    const { guard, categories } = recordingGuard()
    const socket = fakeSocket()
    const community = new CommunityModule(() => socket, guard)
    await community.create('c', 'body')
    await community.acceptInvite('code')
    expect(categories).toEqual(['community.create', 'community.join'])
  })

  it('without a guard the module still works (legacy construction)', async () => {
    const socket = fakeSocket()
    const group = new GroupModule(() => socket)
    await expect(group.create('g', [])).resolves.toMatchObject({ id: '1@g.us' })
  })
})

describe('createOperationGuard — disabled', () => {
  it('runs immediately with no spacing when disabled', async () => {
    const clock = controllableClock()
    const g = createOperationGuard({ enabled: false, intervalsMs: { 'group.create': 99999 } }, clock)
    await g.run('group.create', async () => 1)
    await g.run('group.create', async () => 2)
    expect(clock.sleep).not.toHaveBeenCalled()
  })
})
