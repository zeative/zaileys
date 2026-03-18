import EventEmitter from 'eventemitter3'
import { SignalEngine } from '../signal/engine'
import { CommandRouter } from '../command/router'
import { CommandLoader } from '../command/loader'
import { handleIncomingMessage } from './handler'
import type { MessageContext } from '../types/context'

/**
 * The main Zaileys Bot class.
 * Orchestrates Context, Signal, and Command systems.
 */
export class Zaileys extends EventEmitter {
  public signal: SignalEngine
  public commands = new CommandRouter()
  public loader: CommandLoader

  constructor(private socket: any) {
    super()
    this.signal = new SignalEngine(socket)
    this.loader = new CommandLoader(this.commands)
    
    // Setup socket listeners
    this.setupSocket()
  }

  /**
   * Start the bot and load plugins.
   */
  async start(pluginsDir?: string) {
    if (pluginsDir) {
      await this.loader.load(pluginsDir)
    }
    this.emit('ready')
  }

  /**
   * Register a plugin.
   */
  use(plugin: (bot: Zaileys) => void) {
    plugin(this)
    return this
  }

  private setupSocket() {
    this.socket.ev.on('messages.upsert', async (m: any) => {
      this.emit('message', m)
      await handleIncomingMessage(this, m)
    })
  }
}
