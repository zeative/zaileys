import { describe, it, expect, vi } from 'vitest'
import { executeCommand } from '../../src/command/executor'

describe('executeCommand', () => {
  it('should run command and middleware in order', async () => {
    const trace: string[] = []
    const cmd: any = {
      execute: async () => { trace.push('execute') },
      middleware: [
        async (ctx: any, next: any) => { trace.push('mw1'); await next() },
        async (ctx: any, next: any) => { trace.push('mw2'); await next() }
      ]
    }

    await executeCommand({} as any, cmd)
    expect(trace).toEqual(['mw1', 'mw2', 'execute'])
  })

  it('should allow middleware to block execution', async () => {
    const trace: string[] = []
    const cmd: any = {
      execute: async () => { trace.push('execute') },
      middleware: [
        async (ctx: any, next: any) => { trace.push('blocker') } // no next()
      ]
    }

    await executeCommand({} as any, cmd)
    expect(trace).toEqual(['blocker'])
    expect(trace).not.toContain('execute')
  })
})
