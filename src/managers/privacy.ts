import type { WASocket } from 'baileys'

export type PrivacySetting = {
  lastSeen: 'everyone' | 'contacts' | 'contact_blacklist' | 'none'
  online: 'everyone' | 'match_lastSeen'
  picture: 'everyone' | 'contacts' | 'contact_blacklist' | 'none'
  status: 'everyone' | 'contacts' | 'contact_blacklist' | 'none'
  readReceipts: 'everyone' | 'none'
  groups: 'everyone' | 'contacts' | 'contact_blacklist' | 'none'
}

/**
 * Manages WhatsApp privacy settings & blocklist.
 */
export class PrivacyManager {
  constructor(private socket: WASocket) {}

  /**
   * Get all privacy settings.
   */
  async get(): Promise<PrivacySetting> {
    return this.socket.fetchPrivacySettings(true) as any
  }

  /**
   * Update a specific setting.
   */
  async update(key: keyof PrivacySetting, value: any) {
    switch (key) {
      case 'lastSeen': return this.socket.updateLastSeenPrivacy(value)
      case 'online': return this.socket.updateOnlinePrivacy(value)
      case 'picture': return this.socket.updateProfilePicturePrivacy(value)
      case 'status': return this.socket.updateStatusPrivacy(value)
      case 'readReceipts': return this.socket.updateReadReceiptsPrivacy(value)
      case 'groups': return this.socket.updateGroupsAddPrivacy(value)
    }
  }

  /**
   * Manage blocklist.
   */
  async block(jid: string) {
    return this.socket.updateBlockStatus(jid, 'block')
  }

  async unblock(jid: string) {
    return this.socket.updateBlockStatus(jid, 'unblock')
  }

  async getBlocklist(): Promise<string[]> {
    return this.socket.fetchBlocklist()
  }

  /**
   * Set default disappearing mode.
   */
  async setDisappearingMode(duration: number) {
    return this.socket.updateDefaultDisappearingMode(duration)
  }
}
