export async function contactTransformer(payload: any) {
  const contact = payload.contact || payload.contacts
  if (!contact) return payload

  // VCard generation logic (simplified for now)
  const generateVCard = (c: any) => {
    return `BEGIN:VCARD\nVERSION:3.0\nFN:${c.name}\nTEL;type=CELL;type=VOICE;waid=${c.id.split('@')[0]}:+${c.id.split('@')[0]}\nEND:VCARD`
  }

  if (Array.isArray(contact)) {
    return {
      ...payload,
      contacts: {
        displayName: `${contact.length} contacts`,
        contacts: contact.map(c => ({ vcard: generateVCard(c) }))
      }
    }
  }

  return {
    ...payload,
    contact: {
      displayName: contact.name,
      vcard: generateVCard(contact)
    }
  }
}
