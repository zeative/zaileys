import type {
  HistorySyncPayload,
  LimitedPayload,
  NewsletterPayload,
  PresencePayload,
} from '../types.js'

type PresenceStatus = PresencePayload['status']

const PRESENCE_STATUSES: ReadonlySet<string> = new Set([
  'available',
  'unavailable',
  'composing',
  'recording',
  'paused',
])

/** Raw shape of a baileys `messaging-history.status` event. */
export interface RawHistorySync {
  syncType: number | string
  status: string
  explicit: boolean
}

/**
 * Reachout timelock shape from baileys `ConnectionState` (State.ts):
 * `{ isActive?: boolean; timeEnforcementEnds?: Date; enforcementType?: ... }`.
 * `timeEnforcementEnds` is a `Date`, coerced to epoch millis for `retryAt`.
 */
export interface RawReachoutTimelock {
  isActive?: boolean
  timeEnforcementEnds?: Date | number
  enforcementType?: string
}

/**
 * Message-capping shape from baileys `NewChatMessageCapInfo` (State.ts):
 * `capping_status` is the enum `NewChatMessageCappingStatusType`
 * (`'NONE' | 'FIRST_WARNING' | 'SECOND_WARNING' | 'CAPPED'`); only `'CAPPED'` is limiting.
 */
export interface RawCapInfo {
  capping_status?: string
  used_quota?: number
  total_quota?: number
}

/** Discriminated input merging the two baileys sources that signal an account limitation. */
export type LimitedInput =
  | { source: 'connection-update'; reachoutTimeLock: RawReachoutTimelock }
  | { source: 'message-capping'; capInfo: RawCapInfo }

/** Raw presence-update shape from baileys (`{ id, presences }`). */
export interface RawPresence {
  id: string
  presences: { [participant: string]: { lastKnownPresence?: string; lastSeen?: number } }
}

/** Discriminated input merging the four baileys newsletter event sources. */
export type NewsletterInput =
  | { source: 'reaction'; payload: { id: string; server_id?: string; reaction?: { code?: string; count?: number } } }
  | { source: 'view'; payload: { id: string; server_id?: string; count?: number } }
  | { source: 'participants'; payload: { id: string; author?: string; user?: string; new_role?: string; action?: string } }
  | { source: 'settings'; payload: { id: string; update?: Record<string, unknown> } }

const toMillis = (value: Date | number | undefined): number => {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return 0
}

/** Re-emit a baileys history-sync status as a typed payload; `null` for non `complete`/`paused` statuses. */
export const decodeHistorySync = (item: RawHistorySync): HistorySyncPayload | null => {
  if (item.status !== 'complete' && item.status !== 'paused') return null
  return {
    syncType: String(item.syncType),
    status: item.status,
    explicit: item.explicit === true,
  }
}

/** Decode an account-limitation event; only active timelocks and `CAPPED` quotas emit, else `null`. */
export const decodeLimited = (input: LimitedInput): LimitedPayload | null => {
  if (input.source === 'connection-update') {
    const lock = input.reachoutTimeLock
    if (lock.isActive !== true) return null
    return { reason: 'reachout-timelock', retryAt: toMillis(lock.timeEnforcementEnds) }
  }
  if (input.capInfo.capping_status !== 'CAPPED') return null
  const payload: LimitedPayload = { reason: 'chat-limit-reached' }
  if (typeof input.capInfo.used_quota === 'number') payload.usedQuota = input.capInfo.used_quota
  if (typeof input.capInfo.total_quota === 'number') payload.totalQuota = input.capInfo.total_quota
  return payload
}

/** Fan a baileys presence-update into one {@link PresencePayload} per participant; entries lacking a valid status are skipped. */
export const decodePresence = (item: RawPresence): PresencePayload[] => {
  if (typeof item.id !== 'string' || item.id.length === 0) return []
  const out: PresencePayload[] = []
  for (const [participant, data] of Object.entries(item.presences ?? {})) {
    const status = data?.lastKnownPresence
    if (typeof status !== 'string' || !PRESENCE_STATUSES.has(status)) continue
    out.push({ jid: item.id, participant, status: status as PresenceStatus })
  }
  return out
}

/** Consolidate the four baileys newsletter sources into a single discriminated payload; `null` when id missing. */
export const decodeNewsletter = (input: NewsletterInput): NewsletterPayload | null => {
  const id = input.payload.id
  if (typeof id !== 'string' || id.length === 0) return null
  const timestamp = Date.now()
  switch (input.source) {
    case 'reaction': {
      const out: NewsletterPayload = { action: 'reaction', newsletterId: id, timestamp }
      if (typeof input.payload.server_id === 'string') out.serverId = input.payload.server_id
      if (typeof input.payload.reaction?.code === 'string') out.emoji = input.payload.reaction.code
      return out
    }
    case 'view': {
      const out: NewsletterPayload = { action: 'view', newsletterId: id, timestamp }
      if (typeof input.payload.server_id === 'string') out.serverId = input.payload.server_id
      if (typeof input.payload.count === 'number') out.count = input.payload.count
      return out
    }
    case 'participants': {
      const out: NewsletterPayload = { action: 'participants', newsletterId: id, timestamp }
      return out
    }
    case 'settings': {
      const out: NewsletterPayload = { action: 'settings', newsletterId: id, timestamp }
      if (input.payload.update) out.update = input.payload.update
      return out
    }
  }
}
