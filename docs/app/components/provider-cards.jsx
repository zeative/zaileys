import Link from 'next/link'

const CARDS = [
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

/** Two tidy, theme-aware provider cards for the landing and comparison pages. */
export function ProviderCards() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '0.9rem',
        margin: '1.5rem 0',
      }}
    >
      {CARDS.map((c) => (
        <Link
          key={c.href}
          href={c.href}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.55rem',
            padding: '1.15rem',
            borderRadius: 14,
            textDecoration: 'none',
            color: 'inherit',
            border: '1px solid var(--x-color-neutral-200)',
            background: 'var(--x-color-neutral-50)',
            transition: 'border-color .15s, transform .15s',
          }}
          className="x:hover:!border-[var(--x-color-primary-400)] x:hover:-translate-y-0.5"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>{c.icon}</span>
            <span style={{ fontWeight: 700, fontSize: '1.02rem' }}>{c.title}</span>
          </div>
          <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.55, opacity: 0.8 }}>{c.body}</p>
          <span
            style={{
              alignSelf: 'flex-start',
              marginTop: 'auto',
              fontSize: '0.72rem',
              fontWeight: 600,
              padding: '0.15rem 0.55rem',
              borderRadius: 999,
              color: 'var(--x-color-primary-600)',
              background: 'color-mix(in srgb, var(--x-color-primary-600) 12%, transparent)',
            }}
          >
            {c.badge} →
          </span>
        </Link>
      ))}
    </div>
  )
}
