import type { CommandMiddleware } from '../types/command'

/**
 * Built-in guards for command protection.
 */
export const guards = {
  /**
   * Restrict command to group chats only.
   */
  onlyGroup: (): CommandMiddleware => async (ctx, next) => {
    if (!ctx.flags.isGroup) {
      return ctx.actions.send('❌ This command can only be used in groups.')
    }
    await next()
  },

  /**
   * Simple cooldown logic (In-memory).
   */
  cooldown: (seconds: number): CommandMiddleware => {
    const records = new Map<string, number>()
    return async (ctx, next) => {
      const key = `${ctx.sender.id}:${ctx.command}`
      const now = Date.now()
      const last = records.get(key) || 0

      if (now - last < seconds * 1000) {
        const remaining = Math.ceil((seconds * 1000 - (now - last)) / 1000)
        return ctx.actions.send(`⏳ Cooldown! Wait ${remaining}s.`)
      }

      records.set(key, now)
      await next()
    }
  },

  /**
   * Only allows the bot owner to execute the command.
   */
  owner: () => {
    return (ctx: any) => {
      // Logic for owner check (e.g. check against config.ownerJid)
      return ctx.sender.id === 'owner@s.whatsapp.net'
    }
  }
}
