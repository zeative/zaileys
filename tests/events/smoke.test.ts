import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { proto } from 'baileys'
import { describe, expect, it, vi } from 'vitest'
import { TypedEventEmitter } from '../../src/client/event-emitter.js'
import type { ClientEventMap } from '../../src/client/types.js'
import { attachInboundPipeline } from '../../src/events/pipeline.js'
import type { InboundEventName } from '../../src/events/types.js'
import { makeInboundSocket, type InboundMockSocket } from '../_helpers/mock-socket-events.js'

const SELF = '123@s.whatsapp.net'
const GROUP = '99-1@g.us'

function setup(): { client: TypedEventEmitter<ClientEventMap>; socket: InboundMockSocket } {
  const client = new TypedEventEmitter<ClientEventMap>()
  const socket = makeInboundSocket({ user: { id: SELF } })
  attachInboundPipeline(
    client,
    socket as unknown as Parameters<typeof attachInboundPipeline>[1],
    { selfJid: SELF },
  )
  return { client, socket }
}

function um(message: Record<string, unknown>, key: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    messages: [
      {
        key: { remoteJid: '999@s.whatsapp.net', id: 'X1', fromMe: false, ...key },
        message,
        messageTimestamp: 1700,
        pushName: 'A',
      },
    ],
    type: 'notify',
  }
}

const EVENT_TRIGGERS: Array<[InboundEventName, (s: InboundMockSocket) => void]> = [
  ['text', (s) => s.triggerMessagesUpsert(um({ conversation: 'hi' }))],
  ['image', (s) => s.triggerMessagesUpsert(um({ imageMessage: { mimetype: 'image/jpeg' } }))],
  ['video', (s) => s.triggerMessagesUpsert(um({ videoMessage: { mimetype: 'video/mp4' } }))],
  ['audio', (s) => s.triggerMessagesUpsert(um({ audioMessage: { mimetype: 'audio/ogg', ptt: true } }))],
  ['document', (s) => s.triggerMessagesUpsert(um({ documentMessage: { mimetype: 'application/pdf', fileName: 'f.pdf' } }))],
  ['sticker', (s) => s.triggerMessagesUpsert(um({ stickerMessage: { mimetype: 'image/webp' } }))],
  [
    'mention',
    (s) =>
      s.triggerMessagesUpsert(
        um(
          { extendedTextMessage: { text: '@me', contextInfo: { mentionedJid: [SELF] } } },
          { remoteJid: GROUP, participant: 'p@s.whatsapp.net' },
        ),
      ),
  ],
  [
    'mention-all',
    (s) =>
      s.triggerMessagesUpsert(
        um(
          { extendedTextMessage: { text: '@all', contextInfo: { groupMentions: [{ groupJid: GROUP }] } } },
          { remoteJid: GROUP, participant: 'p@s.whatsapp.net' },
        ),
      ),
  ],
  ['button-click', (s) => s.triggerMessagesUpsert(um({ buttonsResponseMessage: { selectedButtonId: 'b1', selectedDisplayText: 'Yes' } }))],
  ['list-select', (s) => s.triggerMessagesUpsert(um({ listResponseMessage: { title: 'M', singleSelectReply: { selectedRowId: 'r1' } } }))],
  [
    'edit',
    (s) =>
      s.triggerMessagesUpdate([
        {
          key: { remoteJid: '999@s.whatsapp.net', id: 'M1', fromMe: false },
          update: {
            message: {
              protocolMessage: {
                type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
                key: { id: 'M1' },
                editedMessage: { conversation: 'fix' },
              },
            },
            messageTimestamp: 1800,
          },
        },
      ]),
  ],
  [
    'delete',
    (s) =>
      s.triggerMessagesUpdate([
        {
          key: { remoteJid: '999@s.whatsapp.net', id: 'M1', fromMe: false },
          update: { message: { protocolMessage: { type: proto.Message.ProtocolMessage.Type.REVOKE, key: { id: 'M1' } } } },
        },
      ]),
  ],
  [
    'poll-vote',
    (s) =>
      s.triggerMessagesUpdate([
        {
          key: { remoteJid: '999@s.whatsapp.net', id: 'P1', fromMe: false },
          update: { pollUpdates: [{ pollUpdateMessageKey: { id: 'P1' }, vote: { selectedOptions: [] }, senderTimestampMs: 1 }] },
        },
      ]),
  ],
  [
    'reaction',
    (s) =>
      s.triggerMessagesReaction([
        { key: { remoteJid: '999@s.whatsapp.net', id: 'R1', fromMe: false }, reaction: { key: { id: 'M1' }, text: '👍', senderTimestampMs: 1 } },
      ]),
  ],
  ['group-update', (s) => s.triggerGroupsUpdate([{ id: GROUP, subject: 'New' }])],
  ['group-join', (s) => s.triggerGroupParticipants({ id: GROUP, author: 'a@s.whatsapp.net', participants: [{ id: 'n@s.whatsapp.net' }], action: 'add' })],
  ['group-leave', (s) => s.triggerGroupParticipants({ id: GROUP, author: 'a@s.whatsapp.net', participants: [{ id: 'g@s.whatsapp.net' }], action: 'remove' })],
  ['member-tag', (s) => s.triggerMemberTag({ groupId: GROUP, participant: 'p@s.whatsapp.net', label: 'VIP', messageTimestamp: 1 })],
  ['call-incoming', (s) => s.triggerCall([{ id: 'C1', from: 'c@s.whatsapp.net', status: 'offer', date: new Date(1) }])],
  ['call-ended', (s) => s.triggerCall([{ id: 'C2', from: 'c@s.whatsapp.net', status: 'terminate', date: new Date(2) }])],
  ['history-sync', (s) => s.triggerHistoryStatus({ syncType: 2, status: 'complete', explicit: true })],
  ['limited', (s) => s.triggerMessageCapping({ capping_status: 'CAPPED', used_quota: 1, total_quota: 2 })],
  ['presence', (s) => s.triggerPresence({ id: '999@s.whatsapp.net', presences: { 'a@s.whatsapp.net': { lastKnownPresence: 'composing' } } })],
  ['newsletter', (s) => s.triggerNewsletterReaction({ id: 'nl1', server_id: 's1', reaction: { code: '❤️' } })],
]

describe('Phase 4 smoke: every inbound event key is fire-able', () => {
  it('covers all 24 InboundEventMap keys exactly once', () => {
    const covered = new Set(EVENT_TRIGGERS.map(([name]) => name))
    expect(covered.size).toBe(24)
  })

  it.each(EVENT_TRIGGERS)('event "%s" fires at least once', (name, trigger) => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on(name, seen)
    trigger(socket)
    expect(seen).toHaveBeenCalled()
  })
})

const here = fileURLToPath(new URL('.', import.meta.url))

function collectTestFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...collectTestFiles(full))
    } else if (/\.test(-d)?\.ts$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

function countTestCases(files: string[]): number {
  let total = 0
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    const matches = src.match(/(?:^|\s)(?:it|test)(?:\.each\([^)]*\))?\s*\(/gm)
    total += matches ? matches.length : 0
  }
  return total
}

describe('Phase 4 test count + audit gate', () => {
  it('tests/events tree carries >=150 test cases (CONTEXT.md target)', () => {
    const files = collectTestFiles(here)
    expect(files.length).toBeGreaterThanOrEqual(10)
    const total = countTestCases(files)
    expect(total).toBeGreaterThanOrEqual(150)
  })

  it('audit:any exits 0 (EVT-25 gate)', () => {
    const out = execSync('pnpm -s audit:any', { encoding: 'utf8' })
    expect(out).toMatch(/0 violations/)
  }, 30000)
})
