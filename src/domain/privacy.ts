import { ZaileysDomainError } from './errors.js'
import type { DomainSocketLike } from './socket-like.js'
import type { PrivacyConfig, PrivacySettings, WAReadReceiptsValue } from './types.js'

/**
 * Typed wrapper over the baileys privacy socket methods. Exposed as
 * `client.privacy`. `set` fans a single partial config object out to the
 * matching `update*Privacy` calls, applying only the keys that are defined.
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

  /**
   * Apply a partial privacy configuration in a single call. Only keys present
   * (not `undefined`) are forwarded to their respective baileys method.
   * `readReceipts` accepts a boolean shorthand (`true` → `'all'`, `false` →
   * `'none'`) in addition to the raw {@link WAReadReceiptsValue}.
   */
  async set(config: PrivacyConfig & { readReceipts?: WAReadReceiptsValue | boolean }): Promise<void> {
    const socket = this.requireSocket()

    if (config.lastSeen !== undefined) {
      await socket.updateLastSeenPrivacy(config.lastSeen)
    }
    if (config.online !== undefined) {
      await socket.updateOnlinePrivacy(config.online)
    }
    if (config.profile !== undefined) {
      await socket.updateProfilePicturePrivacy(config.profile)
    }
    if (config.status !== undefined) {
      await socket.updateStatusPrivacy(config.status)
    }
    if (config.readReceipts !== undefined) {
      const value: WAReadReceiptsValue =
        typeof config.readReceipts === 'boolean'
          ? config.readReceipts
            ? 'all'
            : 'none'
          : config.readReceipts
      await socket.updateReadReceiptsPrivacy(value)
    }
    if (config.groupAdd !== undefined) {
      await socket.updateGroupsAddPrivacy(config.groupAdd)
    }
  }

  /** Fetch the current privacy settings. */
  async get(): Promise<PrivacySettings> {
    const socket = this.requireSocket()
    return socket.fetchPrivacySettings()
  }

  /** Block a contact. */
  async block(jid: string): Promise<void> {
    const socket = this.requireSocket()
    await socket.updateBlockStatus(jid, 'block')
  }

  /** Unblock a contact. */
  async unblock(jid: string): Promise<void> {
    const socket = this.requireSocket()
    await socket.updateBlockStatus(jid, 'unblock')
  }

  /** Fetch the current blocklist. */
  async blocklist(): Promise<string[]> {
    const socket = this.requireSocket()
    return socket.fetchBlocklist()
  }

  /** Set the default disappearing-message duration in seconds. */
  async disappearingMode(seconds: number): Promise<void> {
    const socket = this.requireSocket()
    await socket.updateDefaultDisappearingMode(seconds)
  }
}
