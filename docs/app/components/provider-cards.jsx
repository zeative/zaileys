import Link from 'next/link'

const PROVIDERS = [
  {
    href: '/unofficial',
    icon: '🔗',
    title: 'Unofficial · WhatsApp Web',
    body: 'Powered by Baileys. Log in with a QR or pairing code, no Meta approval. Full personal-account power: groups, communities, channels, polls, stickers, presence, edit & delete.',
    badge: 'Default provider',
  },
  {
    href: '/official',
    icon: '☁️',
    title: 'Official · Meta Cloud API',
    body: 'The sanctioned Graph API + webhooks. No ban risk, no device linking. Templates, OTP, marketing campaigns, Flows, catalog commerce, and analytics — everything a business channel needs.',
    badge: 'Business-grade',
  },
]

function Card({ href, icon, title, body, badge }) {
  return (
    <Link href={href} className="zl-card">
      <span className="zl-card__head">
        {icon ? <span className="zl-card__icon">{icon}</span> : null}
        <span className="zl-card__title">{title}</span>
      </span>
      {body ? <p className="zl-card__desc">{body}</p> : null}
      {badge ? <span className="zl-card__badge">{badge} →</span> : null}
    </Link>
  )
}

/** The two big provider cards on the landing and comparison pages. */
export function ProviderCards() {
  return (
    <div className="zl-cards">
      {PROVIDERS.map((c) => (
        <Card key={c.href} {...c} />
      ))}
    </div>
  )
}

/** Generic tidy link-card grid: <LinkCards items={[{ href, title, body?, badge?, icon? }]} />. */
export function LinkCards({ items = [] }) {
  return (
    <div className="zl-cards">
      {items.map((c) => (
        <Card key={c.href} {...c} />
      ))}
    </div>
  )
}
