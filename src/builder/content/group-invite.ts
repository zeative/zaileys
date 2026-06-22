import type { AnyMessageContent } from 'baileys'
import { ZaileysBuilderError } from '../errors.js'
import { RELAY_CONTENT_KEY } from './buttons.js'
import type { GroupInviteOptions } from '../types.js'

// Relayed as a raw groupInviteMessage proto so baileys' high-level send path (which fetches the
// group profile picture and throws item-not-found when the group has none) is bypassed.
export const buildGroupInviteContent = (opts: GroupInviteOptions): AnyMessageContent => {
  if (opts == null || typeof opts.jid !== 'string' || !opts.jid.endsWith('@g.us')) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', 'groupInvite() requires a group jid ending in @g.us')
  }
  if (typeof opts.code !== 'string' || opts.code.trim().length === 0) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', 'groupInvite() requires an invite code')
  }
  const groupInviteMessage: Record<string, unknown> = {
    inviteCode: opts.code,
    inviteExpiration: opts.expiresAt ?? Math.floor(Date.now() / 1000) + 3 * 86400,
    groupJid: opts.jid,
    groupName: opts.subject ?? '',
    caption: opts.caption ?? '',
  }
  if (opts.thumbnail !== undefined) groupInviteMessage['jpegThumbnail'] = opts.thumbnail
  return { [RELAY_CONTENT_KEY]: { groupInviteMessage } } as unknown as AnyMessageContent
}
