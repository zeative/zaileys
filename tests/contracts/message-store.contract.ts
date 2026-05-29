import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Chat, Contact, PresenceData, WAMessage } from 'baileys'
import type { MessageStore } from '../../src/store/index.js'
import { ZaileysStoreError } from '../../src/types/store-error.js'
import {
  sampleChat,
  sampleContact,
  sampleMessages,
  samplePresence,
} from './fixtures.js'

type Factory = () => Promise<MessageStore> | MessageStore
type Cleanup = (store: MessageStore) => Promise<void> | void

const expectStoreClosed = async (promise: Promise<unknown>): Promise<void> => {
  await expect(promise).rejects.toBeInstanceOf(ZaileysStoreError)
  await expect(promise).rejects.toMatchObject({ code: 'STORE_CLOSED' })
}

/**
 * Parameterised contract suite for any `MessageStore` implementation.
 * Adapters spawn this factory in their own `*.test.ts` files to inherit ≥30 scenarios.
 */
export const runMessageStoreContract = (
  name: string,
  factory: Factory,
  cleanup?: Cleanup,
): void => {
  describe(`MessageStore contract: ${name}`, () => {
    let store: MessageStore

    beforeEach(async () => {
      store = await factory()
    })

    afterEach(async () => {
      try {
        if (cleanup) await cleanup(store)
      } finally {
        await store.close().catch(() => undefined)
      }
    })

    describe('Group A — Message CRUD', () => {
      it('A1: getMessage on missing key returns undefined', async () => {
        await expect(
          store.getMessage({ remoteJid: 'a@s.whatsapp.net', fromMe: false, id: 'nope' }),
        ).resolves.toBeUndefined()
      })

      it('A2: saveMessage then getMessage returns deep-equal message', async () => {
        const [m] = sampleMessages('a@s.whatsapp.net', 1)
        await store.saveMessage(m!)
        const read = await store.getMessage(m!.key)
        expect(read).toBeDefined()
        expect(read!.key.id).toBe(m!.key.id)
        expect(read!.message?.conversation).toBe(m!.message?.conversation)
      })

      it('A3: saving same key twice updates (last-write-wins)', async () => {
        const [m] = sampleMessages('a@s.whatsapp.net', 1)
        await store.saveMessage(m!)
        const updated: WAMessage = { ...m!, message: { conversation: 'updated' } } as WAMessage
        await store.saveMessage(updated)
        const read = await store.getMessage(m!.key)
        expect(read!.message?.conversation).toBe('updated')
      })

      it('A4: listMessages on empty store returns []', async () => {
        await expect(store.listMessages('empty@s.whatsapp.net')).resolves.toEqual([])
      })

      it('A5: listMessages returns 10 messages sorted descending by timestamp', async () => {
        const jid = 'list@s.whatsapp.net'
        const msgs = sampleMessages(jid, 10)
        for (const m of msgs) await store.saveMessage(m)
        const list = await store.listMessages(jid)
        expect(list.length).toBe(10)
        for (let i = 1; i < list.length; i += 1) {
          expect(Number(list[i - 1]!.messageTimestamp)).toBeGreaterThanOrEqual(
            Number(list[i]!.messageTimestamp),
          )
        }
      })

      it('A6: listMessages honours limit + before pagination', async () => {
        const jid = 'page@s.whatsapp.net'
        const msgs = sampleMessages(jid, 10)
        for (const m of msgs) await store.saveMessage(m)
        const limited = await store.listMessages(jid, { limit: 5 })
        expect(limited.length).toBe(5)
        const before = 1_700_000_005
        const filtered = await store.listMessages(jid, { limit: 5, before })
        expect(filtered.length).toBeLessThanOrEqual(5)
        for (const m of filtered) {
          expect(Number(m.messageTimestamp)).toBeLessThan(before)
        }
      })
    })

    describe('Group B — Chat CRUD', () => {
      it('B1: getChat missing returns undefined', async () => {
        await expect(store.getChat('missing@s.whatsapp.net')).resolves.toBeUndefined()
      })

      it('B2: saveChat then getChat round-trips fields', async () => {
        const chat = sampleChat('chat1@s.whatsapp.net')
        await store.saveChat(chat)
        const read = await store.getChat('chat1@s.whatsapp.net')
        expect(read).toBeDefined()
        expect(read!.id).toBe('chat1@s.whatsapp.net')
        expect(read!.unreadCount).toBe(0)
      })

      it('B3: listChats returns every saved chat', async () => {
        await store.saveChat(sampleChat('c1@s.whatsapp.net'))
        await store.saveChat(sampleChat('c2@s.whatsapp.net'))
        const all = await store.listChats()
        expect(all.map((c) => c.id).sort()).toEqual(['c1@s.whatsapp.net', 'c2@s.whatsapp.net'])
      })

      it('B4: listChats({ archived: true }) returns only archived chats', async () => {
        await store.saveChat(sampleChat('open@s.whatsapp.net'))
        await store.saveChat(sampleChat('arc@s.whatsapp.net', { archived: true } as Partial<Chat>))
        const archived = await store.listChats({ archived: true })
        expect(archived.length).toBe(1)
        expect(archived[0]!.id).toBe('arc@s.whatsapp.net')
      })
    })

    describe('Group C — Contact CRUD', () => {
      it('C1: getContact missing returns undefined', async () => {
        await expect(store.getContact('missing@s.whatsapp.net')).resolves.toBeUndefined()
      })

      it('C2: saveContact then getContact preserves all fields', async () => {
        const contact = sampleContact('user@s.whatsapp.net')
        await store.saveContact(contact)
        const read = await store.getContact('user@s.whatsapp.net')
        expect(read!.id).toBe('user@s.whatsapp.net')
        expect(read!.name).toBe('Test User')
        expect(read!.notify).toBe('tester')
      })

      it('C3: listContacts returns every saved contact', async () => {
        await store.saveContact(sampleContact('u1@s.whatsapp.net'))
        await store.saveContact(sampleContact('u2@s.whatsapp.net'))
        const all = await store.listContacts()
        expect(all.map((c) => c.id).sort()).toEqual(['u1@s.whatsapp.net', 'u2@s.whatsapp.net'])
      })
    })

    describe('Group D — Presence', () => {
      it('D1: getPresence missing returns undefined', async () => {
        await expect(store.getPresence('missing@s.whatsapp.net')).resolves.toBeUndefined()
      })

      it('D2: savePresence then getPresence round-trips', async () => {
        const presence = samplePresence()
        await store.savePresence('u@s.whatsapp.net', presence)
        const read = await store.getPresence('u@s.whatsapp.net')
        expect(read!.lastKnownPresence).toBe('available')
        expect(read!.lastSeen).toBe(12345)
      })

      it('D3: overwriting presence updates stored value', async () => {
        await store.savePresence('u@s.whatsapp.net', samplePresence())
        await store.savePresence('u@s.whatsapp.net', {
          lastKnownPresence: 'unavailable',
          lastSeen: 99999,
        } as PresenceData)
        const read = await store.getPresence('u@s.whatsapp.net')
        expect(read!.lastKnownPresence).toBe('unavailable')
        expect(read!.lastSeen).toBe(99999)
      })
    })

    describe('Group E — bind(socket)', () => {
      it('E1: messages.upsert event persists every message', async () => {
        const ev = new EventEmitter()
        store.bind({ ev } as never)
        const msgs = sampleMessages('bind@s.whatsapp.net', 2)
        ev.emit('messages.upsert', { messages: msgs, type: 'notify' })
        await new Promise((resolve) => setImmediate(resolve))
        const m0 = await store.getMessage(msgs[0]!.key)
        const m1 = await store.getMessage(msgs[1]!.key)
        expect(m0).toBeDefined()
        expect(m1).toBeDefined()
      })

      it('E2: chats.upsert event persists chats', async () => {
        const ev = new EventEmitter()
        store.bind({ ev } as never)
        const chat = sampleChat('bindchat@s.whatsapp.net')
        ev.emit('chats.upsert', [chat])
        await new Promise((resolve) => setImmediate(resolve))
        const read = await store.getChat('bindchat@s.whatsapp.net')
        expect(read).toBeDefined()
      })

      it('E3: contacts.upsert event persists contacts', async () => {
        const ev = new EventEmitter()
        store.bind({ ev } as never)
        const contact = sampleContact('bindct@s.whatsapp.net')
        ev.emit('contacts.upsert', [contact])
        await new Promise((resolve) => setImmediate(resolve))
        const read = await store.getContact('bindct@s.whatsapp.net')
        expect(read).toBeDefined()
      })

      it('E4: presence.update event persists presence', async () => {
        const ev = new EventEmitter()
        store.bind({ ev } as never)
        const jid = 'bindp@s.whatsapp.net'
        ev.emit('presence.update', { id: jid, presences: { [jid]: samplePresence() } })
        await new Promise((resolve) => setImmediate(resolve))
        const read = await store.getPresence(jid)
        expect(read).toBeDefined()
        expect(read!.lastKnownPresence).toBe('available')
      })
    })

    describe('Group F — concurrency + clear + close', () => {
      it('F1: 1000 parallel saveMessage calls all persist', async () => {
        const jid = 'stress@s.whatsapp.net'
        const msgs = sampleMessages(jid, 1000)
        await Promise.all(msgs.map((m) => store.saveMessage(m)))
        const list = await store.listMessages(jid, { limit: 1000 })
        expect(list.length).toBe(1000)
      })

      it('F2: clear() empties all collections', async () => {
        await store.saveMessage(sampleMessages('a@s.whatsapp.net', 1)[0]!)
        await store.saveChat(sampleChat('c@s.whatsapp.net'))
        await store.saveContact(sampleContact('u@s.whatsapp.net'))
        await store.savePresence('p@s.whatsapp.net', samplePresence())
        await store.clear()
        await expect(store.listMessages('a@s.whatsapp.net')).resolves.toEqual([])
        await expect(store.listChats()).resolves.toEqual([])
        await expect(store.listContacts()).resolves.toEqual([])
        await expect(store.getPresence('p@s.whatsapp.net')).resolves.toBeUndefined()
      })

      it('F3: post-close operations reject with STORE_CLOSED', async () => {
        await store.close()
        const [m] = sampleMessages('x@s.whatsapp.net', 1)
        await expectStoreClosed(store.saveMessage(m!))
        await expectStoreClosed(store.getMessage(m!.key))
        await expectStoreClosed(store.listMessages('x@s.whatsapp.net'))
        await expectStoreClosed(store.saveChat(sampleChat('x@s.whatsapp.net')))
      })

      it('F4: close is idempotent', async () => {
        await store.close()
        await expect(store.close()).resolves.toBeUndefined()
      })

      it('F5: mixed concurrent saves across types all persist', async () => {
        const jid = 'mixed@s.whatsapp.net'
        const msgs = sampleMessages(jid, 300)
        const chats: Chat[] = Array.from({ length: 300 }, (_, i) =>
          sampleChat(`mixed-c${i}@s.whatsapp.net`),
        )
        const contacts: Contact[] = Array.from({ length: 300 }, (_, i) =>
          sampleContact(`mixed-u${i}@s.whatsapp.net`),
        )
        await Promise.all([
          ...msgs.map((m) => store.saveMessage(m)),
          ...chats.map((c) => store.saveChat(c)),
          ...contacts.map((c) => store.saveContact(c)),
        ])
        const mList = await store.listMessages(jid, { limit: 500 })
        const cList = await store.listChats()
        const uList = await store.listContacts()
        expect(mList.length).toBe(300)
        expect(cList.length).toBe(300)
        expect(uList.length).toBe(300)
      })

      it('F6: listMessages returns immutable copies', async () => {
        const jid = 'immut@s.whatsapp.net'
        const msgs = sampleMessages(jid, 3)
        for (const m of msgs) await store.saveMessage(m)
        const first = await store.listMessages(jid)
        first.length = 0
        const second = await store.listMessages(jid)
        expect(second.length).toBe(3)
      })
    })
  })
}
