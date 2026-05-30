import { ZaileysDomainError } from './errors.js'
import type { DomainSocketLike } from './socket-like.js'
import type { PrivacyConfig, PrivacySettings, WAReadReceiptsValue } from './types.js'

/**
 * Typed wrapper over the baileys privacy socket methods. Exposed as
 * `client.privacy`. Bodies are filled by Wave 2 plan-003.
 */
export class PrivacyModule {
  constructor(private readonly getSocket: () => DomainSocketLike | undefined) {}

  protected requireSocket(): DomainSocketLike {
    const socket = this.getSocket()
    if (!socket) {
      throw new ZaileysDomainError('NOT_CONNECTED', 'client not connected')
    }
    return socket
  }

  /** Apply a partial privacy configuration in a single call. */
  async set(config: PrivacyConfig & { readReceipts?: WAReadReceiptsValue | boolean }): Promise<void> {
    this.requireSocket()
    void config
    throw new ZaileysDomainError('OPERATION_FAILED', 'set not yet implemented')
  }

  /** Fetch the current privacy settings. */
  async get(): Promise<PrivacySettings> {
    this.requireSocket()
    throw new ZaileysDomainError('OPERATION_FAILED', 'get not yet implemented')
  }

  /** Block a contact. */
  async block(jid: string): Promise<void> {
    this.requireSocket()
    void jid
    throw new ZaileysDomainError('OPERATION_FAILED', 'block not yet implemented')
  }

  /** Unblock a contact. */
  async unblock(jid: string): Promise<void> {
    this.requireSocket()
    void jid
    throw new ZaileysDomainError('OPERATION_FAILED', 'unblock not yet implemented')
  }

  /** Fetch the current blocklist. */
  async blocklist(): Promise<string[]> {
    this.requireSocket()
    throw new ZaileysDomainError('OPERATION_FAILED', 'blocklist not yet implemented')
  }

  /** Set the default disappearing-message duration. */
  async disappearingMode(seconds: number): Promise<void> {
    this.requireSocket()
    void seconds
    throw new ZaileysDomainError('OPERATION_FAILED', 'disappearingMode not yet implemented')
  }
}
