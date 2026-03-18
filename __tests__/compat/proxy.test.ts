import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createCompatContext } from '../../src/compat/proxy'
import { resetWarnings } from '../../src/compat/warning'

describe('Context Proxy', () => {
  beforeEach(() => {
    resetWarnings()
    vi.restoreAllMocks()
  })
  const mockCtx: any = {
    room: { id: 'room1', type: 'group' },
    sender: { id: 'user1' },
    content: { text: 'hi' }
  }

  it('should map legacy properties correctly', () => {
    const proxy = createCompatContext(mockCtx)
    expect(proxy.roomId).toBe('room1')
    expect(proxy.senderId).toBe('user1')
    expect(proxy.isGroup).toBe(true)
    expect(proxy.message.text).toBe('hi')
  })

  it('should warn on legacy property access', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const proxy = createCompatContext(mockCtx)
    
    // First access
    const id = proxy.roomId
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('deprecated'))
    
    // Second access (should not warn again)
    spy.mockClear()
    const id2 = proxy.roomId
    expect(spy).not.toHaveBeenCalled()
    
    spy.mockRestore()
  })

  it('should pass through normal properties', () => {
    const proxy = createCompatContext(mockCtx)
    expect(proxy.room.id).toBe('room1')
  })
})
