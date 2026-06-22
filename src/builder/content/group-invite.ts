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
  return {
    [RELAY_CONTENT_KEY]: {
      groupInviteMessage: {
        inviteCode: opts.code,
        inviteExpiration: opts.expiresAt ?? 0,
        groupJid: opts.jid,
        groupName: opts.subject ?? '',
        caption: opts.caption ?? '',
      },
    },
  } as unknown as AnyMessageContent
}
