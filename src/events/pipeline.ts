import type { WACallEvent, WAMessage, WAMessageKey } from 'baileys'
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
  const roomNameCache = new Map<string, Promise<string | null>>()
  const resolveRoomName = ctx.groupMetadata != null
    ? (roomId: string): Promise<string | null> => {
        const cached = roomNameCache.get(roomId)
        if (cached !== undefined) return cached
        const gm = ctx.groupMetadata
        if (gm == null) return Promise.resolve(null)
        const pending = gm(roomId).then((m) => m?.subject ?? null).catch(() => null)
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
  const mutationCtx: MutationContext = { selfJid: ctx.selfJid }

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

  const buildMentionMap = async (msg: WAMessage): Promise<Map<string, string> | undefined> => {
    const resolve = ctx.resolveLidToPn
    if (resolve == null) return undefined
    const lids = [...new Set(rawMentionsOf(msg).filter(isLidJid))]
    if (lids.length === 0) return undefined
    const map = new Map<string, string>()
    await Promise.all(
      lids.map(async (lid) => {
        try {
          const pn = await resolve(lid)
          if (pn != null && pn.length > 0) map.set(lid, pn)
        } catch (err) {
          ctx.logger?.warn(err, 'inbound pipeline: lid->pn resolve threw')
        }
      }),
    )
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
    for (const msg of upsert.messages) {
      if (ctx.ignoreMe === true && msg.key?.fromMe === true) continue
      const needsResolve =
        ctx.resolveLidToPn != null && rawMentionsOf(msg).some(isLidJid)
      if (!needsResolve) {
        runMessage(msg, decodeCtx)
        continue
      }
      void buildMentionMap(msg).then((mentionMap) =>
        runMessage(msg, mentionMap != null ? { ...decodeCtx, mentionMap } : decodeCtx),
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
