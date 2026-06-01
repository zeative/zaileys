import { ZaileysBuilderError } from './errors.js'

export interface UsernameResolveSocketLike {
  onWhatsApp(...phoneNumber: string[]): Promise<Array<{ jid: string; exists: boolean }> | undefined>
}

const JID_SUFFIX = /@(s\.whatsapp\.net|g\.us|lid|newsletter|broadcast|c\.us)$/

export const isJid = (value: string): boolean => JID_SUFFIX.test(value)

export const resolveUsername = async (
  socket: UsernameResolveSocketLike,
  username: string,
  cache: Map<string, string>,
  inflight: Map<string, Promise<string>> = sharedInflight,
): Promise<string> => {
  if (isJid(username)) return username
  const cached = cache.get(username)
  if (cached !== undefined) return cached
  const pending = inflight.get(username)
  if (pending !== undefined) return pending
  const task = (async (): Promise<string> => {
    const results = await socket.onWhatsApp(username)
    const hit = results?.find((entry) => entry.exists && entry.jid)
    if (!hit) {
      throw new ZaileysBuilderError('USERNAME_NOT_FOUND', `username "${username}" not found`)
    }
    cache.set(username, hit.jid)
    return hit.jid
  })()
  inflight.set(username, task)
  try {
    return await task
  } finally {
    inflight.delete(username)
  }
}

const sharedInflight = new Map<string, Promise<string>>()
