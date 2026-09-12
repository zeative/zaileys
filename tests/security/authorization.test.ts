import { describe, expect, it } from 'vitest'
import { makeCitation } from '../../src/events/context.js'

const PN = '628111@s.whatsapp.net'
const LID = '628111@lid'

describe('citation ban list', () => {
  it('blocks a banned sender written in the documented @s.whatsapp.net form', async () => {
    const citation = makeCitation({ banned: [PN] }, PN)
    await expect(citation.banned()).resolves.toBe(true)
  })

  it('blocks the same sender when the message carries a device suffix', async () => {
    const citation = makeCitation({ banned: [PN] }, '628111:12@s.whatsapp.net')
    await expect(citation.banned()).resolves.toBe(true)
  })

  it('does not treat a LID as the phone number with the same digits', async () => {
    const citation = makeCitation({ banned: [PN] }, LID)
    await expect(citation.banned()).resolves.toBe(false)
  })

  it('blocks a LID entry against a LID sender', async () => {
    const citation = makeCitation({ banned: [LID] }, LID)
    await expect(citation.banned()).resolves.toBe(true)
  })

  it('leaves an unrelated sender alone', async () => {
    const citation = makeCitation({ banned: [PN] }, '628999@s.whatsapp.net')
    await expect(citation.banned()).resolves.toBe(false)
  })

  it('still supports a predicate', async () => {
    const citation = makeCitation({ banned: (jid) => jid.startsWith('628111') }, PN)
    await expect(citation.banned()).resolves.toBe(true)
  })

  it('authors resolves with the same namespace rules', async () => {
    await expect(makeCitation({ authors: [PN] }, PN).authors()).resolves.toBe(true)
    await expect(makeCitation({ authors: [PN] }, LID).authors()).resolves.toBe(false)
  })

  it('is false when no list is configured', async () => {
    await expect(makeCitation(undefined, PN).banned()).resolves.toBe(false)
  })
})

describe('list entries without a domain', () => {
  it('treats a bare phone number as @s.whatsapp.net', async () => {
    await expect(makeCitation({ banned: ['628111'] }, PN).banned()).resolves.toBe(true)
  })

  it('a bare number still never matches a LID sender', async () => {
    await expect(makeCitation({ banned: ['628111'] }, LID).banned()).resolves.toBe(false)
  })
})
