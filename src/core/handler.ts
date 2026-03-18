import { MessageContextBuilder } from '../context/builder'
import { ArgParser } from '../command/parser'
import { executeCommand } from '../command/executor'
import type { Zaileys } from './zaileys'

/**
 * Centrally handles incoming messages.
 * Maps raw Baileys messages to Command execution.
 */
export async function handleIncomingMessage(bot: Zaileys, m: any) {
  if (!m.messages) return

  for (const msg of m.messages) {
    // 1. Build Context
    const ctx = await MessageContextBuilder.build(msg, bot.signal)
    if (!ctx) continue

    // 2. Identify Prefix & Command
    const prefix = '!' // In real app, this should be configurable
    if (!ctx.text.startsWith(prefix)) continue

    const input = ctx.text.slice(prefix.length).trim()
    const tokens = ArgParser.tokenize(input)
    if (tokens.length === 0) continue

    // 3. Match Route
    const { command, remaining, router } = bot.commands.match(tokens)
    if (!command) continue

    // 4. Map Args & Execute
    const { args, parsedFlags } = ArgParser.parse(remaining)
    const typedArgs = ArgParser.mapToSchema(args, parsedFlags, command.args || {})

    // Enrich context for command
    const cmdCtx: any = {
      ...ctx,
      args,
      parsedFlags,
      typedArgs,
      command: command.name,
      prefix
    }

    try {
      await executeCommand(cmdCtx, command)
    } catch (err) {
      console.error(`[ZA] Command Error (${command.name}):`, err)
      bot.emit('error', err, cmdCtx)
    }
  }
}
