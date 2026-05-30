import { describe, expect, it } from 'vitest'
import { formatConnectionStatus, suppressLibsignalNoise } from '../../src/connection/status-log.js'

describe('formatConnectionStatus', () => {
  it('connecting line names the session', () => {
    const line = formatConnectionStatus({ kind: 'connecting', sessionId: 'default' })
    expect(line).toContain('[zaileys]')
    expect(line).toContain('Connecting to WhatsApp')
    expect(line).toContain('default')
  })

  it('qr line tells the user to scan', () => {
    const line = formatConnectionStatus({ kind: 'qr' })
    expect(line).toContain('Scan the QR code')
    expect(line).toContain('Linked devices')
  })

  it('pairing-code line shows the code', () => {
    const line = formatConnectionStatus({ kind: 'pairing-code', code: 'ABCD-1234' })
    expect(line).toContain('ABCD-1234')
    expect(line).toContain('Link with phone number')
  })

  it('connected line shows the id', () => {
    const line = formatConnectionStatus({ kind: 'connected', id: '628@s.whatsapp.net' })
    expect(line).toContain('Connected as 628@s.whatsapp.net')
  })

  it('reconnecting line shows reason, delay seconds and attempt', () => {
    const line = formatConnectionStatus({
      kind: 'reconnecting',
      attempt: 3,
      delayMs: 2000,
      reason: 'connection-closed',
      invalidCredsSuspected: false,
    })
    expect(line).toContain('connection-closed')
    expect(line).toContain('2.0s')
    expect(line).toContain('attempt 3')
    expect(line).not.toContain('invalid or corrupted')
  })

  it('reconnecting line appends the corrupted-session hint when suspected', () => {
    const line = formatConnectionStatus({
      kind: 'reconnecting',
      attempt: 2,
      delayMs: 1000,
      reason: 'unknown',
      invalidCredsSuspected: true,
    })
    expect(line).toContain('invalid or corrupted')
    expect(line).toContain('Delete the auth folder')
    expect(line).toContain('./.zaileys')
  })

  it('disconnect with willReconnect is suppressed (reconnecting line already covers it)', () => {
    const line = formatConnectionStatus({
      kind: 'disconnect',
      reason: 'connection-lost',
      willReconnect: true,
    })
    expect(line).toBeNull()
  })

  it('disconnect without reconnect prints a terminal line', () => {
    const line = formatConnectionStatus({
      kind: 'disconnect',
      reason: 'logged-out',
      willReconnect: false,
    })
    expect(line).toContain('Disconnected (logged-out)')
  })
})

describe('suppressLibsignalNoise', () => {
  it('drops libsignal "Closing session:" dumps but passes other console.info through', () => {
    const original = console.info
    const seen: unknown[][] = []
    console.info = (...args: unknown[]): void => {
      seen.push(args)
    }
    try {
      suppressLibsignalNoise()
      console.info('Closing session:', { huge: 'SessionEntry' })
      console.info('regular log', 42)
      expect(seen).toHaveLength(1)
      expect(seen[0]?.[0]).toBe('regular log')
    } finally {
      console.info = original
    }
  })
})
