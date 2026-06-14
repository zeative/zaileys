import { NotFoundPage } from 'nextra-theme-docs'

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

const links = [
  { href: '/', label: 'Introduction' },
  { href: '/getting-started', label: 'Getting Started' },
  { href: '/sending-messages', label: 'Sending Messages' },
  { href: '/api-reference', label: 'API Reference' },
  { href: '/troubleshooting', label: 'Troubleshooting & FAQ' },
]

export default function NotFound() {
  return (
    <NotFoundPage content="Report a broken link" labels="broken-link">
      <div style={{ textAlign: 'center', maxWidth: 560, margin: '0 auto' }}>
        <div style={{ fontSize: '5rem', fontWeight: 800, lineHeight: 1, letterSpacing: '-0.04em', opacity: 0.9 }}>404</div>
        <h1 style={{ marginTop: '0.5rem' }}>This page got disconnected</h1>
        <p style={{ opacity: 0.7, marginTop: '0.5rem' }}>
          The page you’re looking for doesn’t exist or was moved. Try the search above, or jump to a popular page:
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center', marginTop: '1.25rem' }}>
          {links.map((l) => (
            <a
              key={l.href}
              href={`${basePath}${l.href === '/' ? '' : l.href}`}
              style={{
                padding: '0.4rem 0.85rem',
                fontSize: '0.85rem',
                fontWeight: 500,
                borderRadius: 999,
                border: '1px solid light-dark(rgba(0,0,0,0.14), rgba(255,255,255,0.16))',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              {l.label}
            </a>
          ))}
        </div>
      </div>
    </NotFoundPage>
  )
}
