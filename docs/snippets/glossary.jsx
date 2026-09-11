// Single source for jargon tooltips; reference/glossary.mdx lists the same terms in full.
// Terms live inside the component: Mintlify snippets don't expose other top-level declarations to it.
export const Term = ({ id, children }) => {
  const TERMS = {
    jid: {
      name: 'JID',
      tip: 'A WhatsApp address. A person is 628xxxxxxxxxx@s.whatsapp.net, a group is xxxxxxxxxx@g.us, a channel ends in @newsletter.',
    },
    lid: {
      name: 'LID',
      tip: 'A privacy ID WhatsApp can show instead of a phone number in some chats. It ends in @lid.',
    },
    'pairing-code': {
      name: 'pairing code',
      tip: 'An 8-character code you type into WhatsApp → Linked devices → Link with phone number instead, as an alternative to scanning a QR.',
    },
    session: {
      name: 'session',
      tip: 'The saved login that lets Zaileys reconnect without scanning again. It lives in the auth store.',
    },
    waba: {
      name: 'WABA',
      tip: 'WhatsApp Business Account: the Meta account that owns your Cloud API phone numbers and templates.',
    },
    'phone-number-id': {
      name: 'phone number ID',
      tip: "The Cloud API's numeric ID for your business number (not the number itself), shown in Meta's WhatsApp → API Setup page.",
    },
    webhook: {
      name: 'webhook',
      tip: 'A URL on your server that Meta calls with every incoming message and status update.',
    },
    'service-window': {
      name: '24-hour window',
      tip: "On the Cloud API you can send free-form messages only within 24 hours of the user's last message; after that, use an approved template.",
    },
  }
  const term = TERMS[id]
  if (!term) return <>{children}</>
  return (
    <Tooltip headline={term.name} tip={term.tip} cta="Open the glossary" href={`/reference/glossary#${id}`}>
      {children ?? term.name}
    </Tooltip>
  )
}
