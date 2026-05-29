import { makeIntegrationSocket, type IntegrationMockSocket } from './mock-socket-integration.js'
import type { MockSocketUser } from './mock-socket.js'

export interface InboundMockSocket extends IntegrationMockSocket {
  triggerMessagesUpsert(payload: Record<string, unknown>): void
  triggerMessagesUpdate(updates: unknown[]): void
  triggerMessagesReaction(items: unknown[]): void
  triggerGroupsUpdate(updates: unknown[]): void
  triggerGroupParticipants(payload: Record<string, unknown>): void
  triggerMemberTag(payload: Record<string, unknown>): void
  triggerCall(items: unknown[]): void
  triggerHistoryStatus(payload: Record<string, unknown>): void
  triggerPresence(payload: Record<string, unknown>): void
  triggerNewsletterReaction(payload: Record<string, unknown>): void
  triggerNewsletterView(payload: Record<string, unknown>): void
  triggerNewsletterParticipants(payload: Record<string, unknown>): void
  triggerNewsletterSettings(payload: Record<string, unknown>): void
  triggerMessageCapping(payload: Record<string, unknown>): void
}

export function makeInboundSocket(initial?: { user?: MockSocketUser }): InboundMockSocket {
  const base = makeIntegrationSocket(initial)
  const emitLogged = (type: string, payload: unknown): void => {
    base.eventLog.push({ type, payload, ts: Date.now() })
    base.ev.emit(type, payload)
  }
  return Object.assign(base, {
    triggerMessagesUpsert(payload: Record<string, unknown>) {
      emitLogged('messages.upsert', payload)
    },
    triggerMessagesUpdate(updates: unknown[]) {
      emitLogged('messages.update', updates)
    },
    triggerMessagesReaction(items: unknown[]) {
      emitLogged('messages.reaction', items)
    },
    triggerGroupsUpdate(updates: unknown[]) {
      emitLogged('groups.update', updates)
    },
    triggerGroupParticipants(payload: Record<string, unknown>) {
      emitLogged('group-participants.update', payload)
    },
    triggerMemberTag(payload: Record<string, unknown>) {
      emitLogged('group.member-tag.update', payload)
    },
    triggerCall(items: unknown[]) {
      emitLogged('call', items)
    },
    triggerHistoryStatus(payload: Record<string, unknown>) {
      emitLogged('messaging-history.status', payload)
    },
    triggerPresence(payload: Record<string, unknown>) {
      emitLogged('presence.update', payload)
    },
    triggerNewsletterReaction(payload: Record<string, unknown>) {
      emitLogged('newsletter.reaction', payload)
    },
    triggerNewsletterView(payload: Record<string, unknown>) {
      emitLogged('newsletter.view', payload)
    },
    triggerNewsletterParticipants(payload: Record<string, unknown>) {
      emitLogged('newsletter-participants.update', payload)
    },
    triggerNewsletterSettings(payload: Record<string, unknown>) {
      emitLogged('newsletter-settings.update', payload)
    },
    triggerMessageCapping(payload: Record<string, unknown>) {
      emitLogged('message-capping.update', payload)
    },
  })
}
