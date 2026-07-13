import type { AnyMessageContent, MiscMessageGenerationOptions, WAMessage } from 'baileys'

/** Minimal event-bus shape both baileys `ev` and the cloud synthetic emitter satisfy. */
export interface TransportEventBus {
  on(event: string, listener: (...args: unknown[]) => void): unknown
  off(event: string, listener: (...args: unknown[]) => void): unknown
}

/**
 * Messaging seam shared by both providers. The baileys socket satisfies this structurally
 * (asserted in tests); CloudTransport implements it by translating content to Graph calls.
 * Provider identity lives on the Client, not the transport, so the raw socket qualifies as-is.
 */
export interface Transport {
  sendMessage(
    jid: string,
    content: AnyMessageContent,
    options?: MiscMessageGenerationOptions,
  ): Promise<WAMessage | undefined>
  user?: { id?: string | null } | null
  ev: TransportEventBus
}
