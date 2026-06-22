import type { AnyMessageContent } from 'baileys'
import { ZaileysBuilderError } from '../errors.js'
import type { GroupInviteOptions } from '../types.js'

export const buildGroupInviteContent = (opts: GroupInviteOptions): AnyMessageContent => {
  if (opts == null || typeof opts.jid !== 'string' || !opts.jid.endsWith('@g.us')) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', 'groupInvite() requires a group jid ending in @g.us')
  }
  if (typeof opts.code !== 'string' || opts.code.trim().length === 0) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', 'groupInvite() requires an invite code')
  }
  return {
    groupInvite: {
      jid: opts.jid,
      inviteCode: opts.code,
      inviteExpiration: opts.expiresAt ?? 0,
      subject: opts.subject ?? '',
      text: opts.caption ?? '',
    },
  } as unknown as AnyMessageContent
}
