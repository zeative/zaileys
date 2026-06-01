import type { WACallEvent } from 'baileys'
import type { CallPayload } from '../types.js'

type IncomingCall = Extract<CallPayload, { kind: 'incoming' }>
type EndedCall = Extract<CallPayload, { kind: 'ended' }>

const INCOMING_STATUSES: ReadonlySet<WACallEvent['status']> = new Set(['offer', 'ringing'])
const ENDED_STATUSES: ReadonlySet<WACallEvent['status']> = new Set(['timeout', 'reject', 'accept', 'terminate'])

const toMillis = (date: WACallEvent['date']): number => {
  const ms = date instanceof Date ? date.getTime() : Date.parse(String(date))
  return Number.isFinite(ms) ? ms : 0
}

export const decodeCallIncoming = (item: WACallEvent): IncomingCall | null => {
  if (typeof item.id !== 'string' || item.id.length === 0) return null
  if (!INCOMING_STATUSES.has(item.status)) return null
  return {
    kind: 'incoming',
    callId: item.id,
    from: item.from,
    isGroup: item.isGroup === true,
    isVideo: item.isVideo === true,
    timestamp: toMillis(item.date),
    status: item.status,
  }
}

export const decodeCallEnded = (item: WACallEvent): EndedCall | null => {
  if (typeof item.id !== 'string' || item.id.length === 0) return null
  if (!ENDED_STATUSES.has(item.status)) return null
  return {
    kind: 'ended',
    callId: item.id,
    from: item.from,
    isGroup: item.isGroup === true,
    isVideo: item.isVideo === true,
    timestamp: toMillis(item.date),
    status: item.status,
  }
}
