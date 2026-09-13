import type { WACallEvent, WAMessage, WAMessageKey } from 'baileys'
import { LRUCache } from 'lru-cache'
import type { CitationConfig } from './context.js'
import type { TextOptions } from '../builder/builder.js'
import type { ClientEventMap, Logger } from '../client/types.js'
import type { TypedEventEmitter } from '../client/event-emitter.js'
import { dropSpoofedSelfOnly, type UpsertPayload } from './guards.js'
import {
  decodeCallEnded,
  decodeCallIncoming,
} from './decoders/calls.js'
import {
  decodeGroupJoin,
  decodeGroupLeave,
  decodeGroupUpdate,
  decodeMemberTag,
  type GroupMetadataUpdate,
  type GroupParticipantsUpdate,
  type MemberTagUpdate,
} from './decoders/groups.js'
import {
  decodeButtonClick,
  decodeListSelect,
  type InteractiveContext,
} from './decoders/interactive.js'
import {
  decodeHistorySync,
  decodeLimited,
  decodeNewsletter,
  decodePresence,
  type RawCapInfo,
  type RawHistorySync,
  type RawPresence,
  type RawReachoutTimelock,
} from './decoders/lifecycle.js'
import {
  decodeAudio,
  decodeDocument,
  decodeImage,
  decodeMention,
  decodeMentionAll,
  decodeMessage,
  decodeSticker,
  decodeText,
  decodeVideo,
  rawMentionsOf,
  type DecodeContext,
} from './decoders/messages.js'
import { isLidJid } from './decoders/_shared.js'
import { jidNormalizedUser } from 'baileys'
import {
  decodeDelete,
  decodeEdit,
  decodePollVote,
  decodeReaction,
  type MessageUpdate,
  type MutationContext,
  type ReactionItem,
} from './decoders/mutations.js'

export interface InboundPipelineHandle {
  detach: () => void
}

export interface InboundPipelineContext {
  selfJid: string
  selfLid?: string
  selfName?: string
  logger?: Logger
  channelId?: string
  receiverId?: string
  prefixes?: string[]
  citationConfig?: CitationConfig
  groupMetadata?: (groupId: string) => Promise<{ subject?: string } | null>
  receiverName?: () => Promise<string | null>
  resolveQuoted?: (id: string, remoteJid: string) => Promise<WAMessage | null>
  resolveLidToPn?: (lid: string) => Promise<string | null>
  sendReply?: (target: string, content: string, opts: TextOptions | undefined, quoted: WAMessage) => Promise<WAMessageKey>
  react?: (key: WAMessageKey, emoji: string) => Promise<WAMessageKey>
  ignoreMe?: boolean
  /** Messages allowed to wait on LID resolution at once. Default 256. */
  maxPendingResolutions?: number
  /**
   * Weight budget for messages queued behind those; beyond it the overflow is shed. A plain message
   * weighs 1, mentions and long text add to it. Default 20000.
   */
  maxQueuedResolutions?: number
}

export interface BaileysEventSurface {
  on: (event: string, handler: (...args: unknown[]) => void) => void
  off: (event: string, handler: (...args: unknown[]) => void) => void
}

export interface PipelineSocketLike {
  ev: BaileysEventSurface
}

type ClientEmitter = TypedEventEmitter<ClientEventMap>

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])

const MENTION_RESOLVE_TIMEOUT_MS = 3000
/** `contextInfo.mentionedJid` is uncapped on the wire; one message must not fan out unbounded. */
const MAX_LID_TARGETS_PER_MESSAGE = 128
const LID_RESOLVE_CONCURRENCY = 8
const DEFAULT_MAX_PENDING_RESOLUTIONS = 256
const DEFAULT_MAX_QUEUED_RESOLUTIONS = 20_000
const SHED_WARN_INTERVAL_MS = 10_000
const LID_CACHE_MAX = 2000
const LID_CACHE_TTL_MS = 10 * 60 * 1000
const ROOM_NAME_CACHE_MAX = 500
const ROOM_NAME_CACHE_TTL_MS = 5 * 60 * 1000

const raceTimeout = <T>(p: Promise<T>, ms: number): Promise<T | null> =>
  new Promise<T | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), ms)
    p.then(
      (v) => { clearTimeout(timer); resolve(v) },
      () => { clearTimeout(timer); resolve(null) },
    )
  })

const connectionReachout = (update: unknown): RawReachoutTimelock | null => {
  if (update == null || typeof update !== 'object') return null
  const lock = (update as { reachoutTimeLock?: unknown }).reachoutTimeLock
  if (lock == null || typeof lock !== 'object') return null
  return lock as RawReachoutTimelock
}

export function attachInboundPipeline(
  client: ClientEmitter,
  socket: PipelineSocketLike,
  ctx: InboundPipelineContext,
): InboundPipelineHandle {
  const cleanups: Array<() => void> = []
  /** Bounded and short-lived: an unbounded map grew per group forever, and a cached failure or
   *  rename stuck until restart. */
  const roomNameCache = new LRUCache<string, Promise<string | null>>({
    max: ROOM_NAME_CACHE_MAX,
    ttl: ROOM_NAME_CACHE_TTL_MS,
  })
  const resolveRoomName = ctx.groupMetadata != null
    ? (roomId: string): Promise<string | null> => {
        const cached = roomNameCache.get(roomId)
        if (cached !== undefined) return cached
        const gm = ctx.groupMetadata
        if (gm == null) return Promise.resolve(null)
        /** A failed lookup is not cached, so a transient error does not pin the name to null. */
        const pending = gm(roomId)
          .then((m) => m?.subject ?? null)
          .catch(() => {
            roomNameCache.delete(roomId)
            return null
          })
        roomNameCache.set(roomId, pending)
        return pending
      }
    : undefined
  const decodeCtx: DecodeContext = {
    selfJid: ctx.selfJid,
    ...(ctx.selfLid != null ? { selfLid: ctx.selfLid } : {}),
    ...(ctx.selfName != null ? { selfName: ctx.selfName } : {}),
    receiverId: ctx.receiverId ?? ctx.selfJid,
    ...(ctx.logger != null ? { logger: ctx.logger } : {}),
    ...(ctx.channelId != null ? { channelId: ctx.channelId } : {}),
    ...(ctx.prefixes != null ? { prefixes: ctx.prefixes } : {}),
    ...(ctx.citationConfig != null ? { citationConfig: ctx.citationConfig } : {}),
    ...(resolveRoomName != null ? { resolveRoomName } : {}),
    ...(ctx.receiverName != null ? { resolveReceiverName: ctx.receiverName } : {}),
    ...(ctx.resolveQuoted != null ? { resolveQuoted: ctx.resolveQuoted } : {}),
    ...(ctx.sendReply != null ? { reply: ctx.sendReply } : {}),
    ...(ctx.react != null ? { react: ctx.react } : {}),
  }
  const interactiveCtx: InteractiveContext = ctx.logger
    ? { selfJid: ctx.selfJid, logger: ctx.logger }
    : { selfJid: ctx.selfJid }
  const mutationCtx: MutationContext = {
    selfJid: ctx.selfJid,
    ...(ctx.resolveQuoted != null ? { resolvePoll: ctx.resolveQuoted } : {}),
  }

  const subscribe = (event: string, handler: (payload: unknown) => void): void => {
    const wrapped = (...args: unknown[]): void => {
      try {
        handler(args[0])
      } catch (err) {
        ctx.logger?.warn(err, `inbound pipeline: handler for ${event} threw`)
      }
    }
    socket.ev.on(event, wrapped)
    cleanups.push(() => socket.ev.off(event, wrapped))
  }

  const runMessage = (msg: WAMessage, msgCtx: DecodeContext): void => {
    tryEmit(() => decodeMessage(msg, msgCtx), (p) => client.emit('message', p))
    tryEmit(() => decodeText(msg, msgCtx), (p) => client.emit('text', p))
    tryEmit(() => decodeImage(msg, msgCtx), (p) => client.emit('image', p))
    tryEmit(() => decodeVideo(msg, msgCtx), (p) => client.emit('video', p))
    tryEmit(() => decodeAudio(msg, msgCtx), (p) => client.emit('audio', p))
    tryEmit(() => decodeDocument(msg, msgCtx), (p) => client.emit('document', p))
    tryEmit(() => decodeSticker(msg, msgCtx), (p) => client.emit('sticker', p))
    tryEmit(() => decodeMention(msg, msgCtx), (p) => client.emit('mention', p))
    tryEmit(() => decodeMentionAll(msg, msgCtx), (p) => client.emit('mention-all', p))
    tryEmit(() => decodeButtonClick(msg, interactiveCtx), (p) => client.emit('button-click', p))
    tryEmit(() => decodeListSelect(msg, interactiveCtx), (p) => client.emit('list-select', p))
  }

  const normLid = (jid: string | null | undefined): string | null => {
    if (typeof jid !== 'string' || jid.length === 0) return null
    let n: string
    try { n = jidNormalizedUser(jid) } catch { n = jid }
    return isLidJid(n) ? n : null
  }

  const lidCache = new LRUCache<string, string>({ max: LID_CACHE_MAX, ttl: LID_CACHE_TTL_MS })

  /** `identityOnly` skips mentions: the sender decides authorization, mentions are only display. */
  const lidTargetsOf = (msg: WAMessage, identityOnly = false): string[] => {
    const out = new Set<string>()
    const identity = [msg.key?.participant, msg.key?.remoteJid, ctx.selfJid]
    for (const cand of identityOnly ? identity : [...identity, ...rawMentionsOf(msg)]) {
      const lid = normLid(cand)
      if (lid != null) out.add(lid)
      if (out.size >= MAX_LID_TARGETS_PER_MESSAGE) break
    }
    return [...out]
  }

  /**
   * One lookup per LID while it is in flight. A flood from a few hundred senders otherwise issued a
   * fresh network lookup for every single message before the first answer could be cached.
   */
  const inflightLookups = new Map<string, Promise<string | null>>()
  const lookupLid = (resolve: (lid: string) => Promise<string | null>, lid: string): Promise<string | null> => {
    const existing = inflightLookups.get(lid)
    if (existing !== undefined) return existing
    const lookup = (async (): Promise<string | null> => {
      try {
        const pn = await raceTimeout(Promise.resolve(resolve(lid)), MENTION_RESOLVE_TIMEOUT_MS)
        if (pn == null || pn.length === 0) return null
        let normalized = pn
        try { normalized = jidNormalizedUser(pn) } catch { normalized = pn }
        lidCache.set(lid, normalized)
        return normalized
      } catch (err) {
        ctx.logger?.warn(err, 'inbound pipeline: lid->pn resolve threw')
        return null
      } finally {
        inflightLookups.delete(lid)
      }
    })()
    inflightLookups.set(lid, lookup)
    return lookup
  }

  const maxPending = ctx.maxPendingResolutions ?? DEFAULT_MAX_PENDING_RESOLUTIONS
  const maxQueued = ctx.maxQueuedResolutions ?? DEFAULT_MAX_QUEUED_RESOLUTIONS
  let pendingResolutions = 0
  let queuedWeight = 0
  const resolutionBacklog: Array<{ weight: number; start: () => void }> = []
  let shedSinceWarn = 0
  let lastShedWarn = 0

  /**
   * Rough retained cost of holding a message while it waits. A count cap treated a 2 KB text the
   * same as an 80 KB mention bomb, and shed legitimate reconnect catch-up with the heap at 43 MB.
   */
  const weightOf = (msg: WAMessage): number => {
    const content = msg.message as Record<string, { text?: unknown } | string | undefined> | null | undefined
    const conversation = content?.['conversation']
    const extended = content?.['extendedTextMessage']
    const text =
      typeof conversation === 'string'
        ? conversation
        : typeof extended === 'object' && typeof extended?.text === 'string'
          ? extended.text
          : ''
    return 1 + Math.floor(rawMentionsOf(msg).length / 32) + Math.floor(text.length / 8192)
  }

  /** Every target already cached means there is nothing to wait for. */
  const mapFromCache = (lids: string[]): Map<string, string> | undefined => {
    const map = new Map<string, string>()
    for (const lid of lids) {
      const hit = lidCache.get(lid)
      if (hit === undefined) return undefined
      map.set(lid, hit)
    }
    return map
  }

  /**
   * Backpressure for messages that need LID resolution. When lookups are slow they used to pile up
   * without limit (a 4k-message flood held ~436 MB). Overflow is shed rather than processed without
   * resolution: delivering it with an unresolved identity would let a flood bypass ban lists.
   */
  const scheduleResolution = (weight: number, task: (underPressure: boolean) => Promise<void>): void => {
    const start = (underPressure: boolean): void => {
      pendingResolutions += 1
      void task(underPressure).finally(() => {
        pendingResolutions -= 1
        const next = resolutionBacklog.shift()
        if (next !== undefined) {
          queuedWeight -= next.weight
          next.start()
        }
      })
    }
    if (pendingResolutions < maxPending) {
      start(false)
      return
    }
    if (queuedWeight + weight <= maxQueued) {
      /**
       * A queued message resolves only its sender. Mention lookups were what made the backlog grow:
       * without this a slow resolver shed ~44% of a legitimate 4k-message catch-up after reconnect.
       */
      queuedWeight += weight
      resolutionBacklog.push({ weight, start: () => start(true) })
      return
    }
    shedSinceWarn += 1
    const now = Date.now()
    if (now - lastShedWarn >= SHED_WARN_INTERVAL_MS) {
      ctx.logger?.warn(
        { shed: shedSinceWarn, pending: pendingResolutions, queuedWeight },
        'inbound pipeline: overloaded, shed messages waiting on LID resolution',
      )
      shedSinceWarn = 0
      lastShedWarn = now
    }
  }

  const buildLidMap = async (lids: string[]): Promise<Map<string, string> | undefined> => {
    const resolve = ctx.resolveLidToPn
    if (resolve == null || lids.length === 0) return undefined
    const map = new Map<string, string>()
    const pending: string[] = []
    for (const lid of lids) {
      const hit = lidCache.get(lid)
      if (hit !== undefined) map.set(lid, hit)
      else pending.push(lid)
    }
    /** Bounded batches: an unbounded Promise.all here is a usync flood the account gets banned for. */
    for (let i = 0; i < pending.length; i += LID_RESOLVE_CONCURRENCY) {
      const batch = pending.slice(i, i + LID_RESOLVE_CONCURRENCY)
      await Promise.all(
        batch.map(async (lid) => {
          const pn = await lookupLid(resolve, lid)
          if (pn !== null) map.set(lid, pn)
        }),
      )
    }
    return map.size > 0 ? map : undefined
  }

  const tryEmit = <T>(decode: () => T | null, emit: (payload: T) => void): void => {
    let payload: T | null
    try {
      payload = decode()
    } catch (err) {
      ctx.logger?.warn(err, 'inbound pipeline: decoder threw')
      return
    }
    if (payload === null || payload === undefined) return
    emit(payload)
  }

  subscribe('messages.upsert', (raw) => {
    const upsert = dropSpoofedSelfOnly(raw as UpsertPayload)
    const baseCtx = upsert.type === 'append' ? { ...decodeCtx, isOld: true } : decodeCtx
    for (const msg of upsert.messages) {
      if (ctx.ignoreMe === true && msg.key?.fromMe === true) continue
      const lids = ctx.resolveLidToPn != null ? lidTargetsOf(msg) : []
      if (lids.length === 0) {
        runMessage(msg, baseCtx)
        continue
      }
      const cached = mapFromCache(lids) ?? (pendingResolutions >= maxPending ? mapFromCache(lidTargetsOf(msg, true)) : undefined)
      if (cached !== undefined) {
        runMessage(msg, { ...baseCtx, lidMap: cached })
        continue
      }
      scheduleResolution(weightOf(msg), (underPressure) =>
        buildLidMap(underPressure ? lidTargetsOf(msg, true) : lids)
          .then((lidMap) => runMessage(msg, lidMap != null ? { ...baseCtx, lidMap } : baseCtx))
          .catch((err) => {
            /** Logged, not re-run: a replay could emit the message twice or with an unresolved identity. */
            ctx.logger?.warn(err, 'inbound pipeline: deferred lid resolve emit failed')
          }),
      )
    }
  })

  subscribe('messages.update', (raw) => {
    for (const item of asArray<MessageUpdate>(raw)) {
      tryEmit(() => decodeEdit(item, mutationCtx), (p) => client.emit('edit', p))
      tryEmit(() => decodeDelete(item, mutationCtx), (p) => client.emit('delete', p))
      tryEmit(() => decodePollVote(item, mutationCtx), (p) => client.emit('poll-vote', p))
    }
  })

  subscribe('messages.reaction', (raw) => {
    for (const item of asArray<ReactionItem>(raw)) {
      tryEmit(() => decodeReaction(item, mutationCtx), (p) => client.emit('reaction', p))
    }
  })

  subscribe('groups.update', (raw) => {
    for (const item of asArray<GroupMetadataUpdate>(raw)) {
      tryEmit(() => decodeGroupUpdate(item), (p) => client.emit('group-update', p))
    }
  })

  subscribe('group-participants.update', (raw) => {
    const item = raw as GroupParticipantsUpdate
    tryEmit(() => decodeGroupJoin(item), (p) => client.emit('group-join', p))
    tryEmit(() => decodeGroupLeave(item), (p) => client.emit('group-leave', p))
  })

  subscribe('group.member-tag.update', (raw) => {
    tryEmit(() => decodeMemberTag(raw as MemberTagUpdate), (p) => client.emit('member-tag', p))
  })

  subscribe('call', (raw) => {
    for (const item of asArray<WACallEvent>(raw)) {
      tryEmit(() => decodeCallIncoming(item), (p) => client.emit('call-incoming', p))
      tryEmit(() => decodeCallEnded(item), (p) => client.emit('call-ended', p))
    }
  })

  subscribe('messaging-history.status', (raw) => {
    tryEmit(() => decodeHistorySync(raw as RawHistorySync), (p) => client.emit('history-sync', p))
  })

  subscribe('presence.update', (raw) => {
    const entries = (() => {
      try {
        return decodePresence(raw as RawPresence)
      } catch (err) {
        ctx.logger?.warn(err, 'inbound pipeline: decodePresence threw')
        return []
      }
    })()
    for (const entry of entries) client.emit('presence', entry)
  })

  subscribe('connection.update', (raw) => {
    const reachoutTimeLock = connectionReachout(raw)
    if (reachoutTimeLock === null) return
    tryEmit(
      () => decodeLimited({ source: 'connection-update', reachoutTimeLock }),
      (p) => client.emit('limited', p),
    )
  })

  subscribe('message-capping.update', (raw) => {
    tryEmit(
      () => decodeLimited({ source: 'message-capping', capInfo: raw as RawCapInfo }),
      (p) => client.emit('limited', p),
    )
  })

  subscribe('newsletter.reaction', (raw) => {
    tryEmit(
      () => decodeNewsletter({ source: 'reaction', payload: raw as { id: string } }),
      (p) => client.emit('newsletter', p),
    )
  })

  subscribe('newsletter.view', (raw) => {
    tryEmit(
      () => decodeNewsletter({ source: 'view', payload: raw as { id: string } }),
      (p) => client.emit('newsletter', p),
    )
  })

  subscribe('newsletter-participants.update', (raw) => {
    tryEmit(
      () => decodeNewsletter({ source: 'participants', payload: raw as { id: string } }),
      (p) => client.emit('newsletter', p),
    )
  })

  subscribe('newsletter-settings.update', (raw) => {
    tryEmit(
      () => decodeNewsletter({ source: 'settings', payload: raw as { id: string } }),
      (p) => client.emit('newsletter', p),
    )
  })

  let detached = false
  return {
    detach() {
      if (detached) return
      detached = true
      for (const off of cleanups) off()
      cleanups.length = 0
    },
  }
}
