'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

const OFFICIAL_PREFIX = '/official'
const UNOFFICIAL_HOME = '/getting-started'
const OFFICIAL_HOME = '/official'

/**
 * Minimal segmented selector in the navbar that switches between the two doc trees.
 * Theme-aware, no hardcoded backgrounds — the active pill uses the theme accent.
 */
export function ProviderSwitch() {
  const pathname = usePathname() ?? ''
  const clean = pathname.replace(/^\/zaileys/, '') || '/'
  const isOfficial = clean === OFFICIAL_PREFIX || clean.startsWith(`${OFFICIAL_PREFIX}/`)

  const pill = (on) => ({
    padding: '0.25rem 0.6rem',
    fontSize: '0.78rem',
    fontWeight: 600,
    borderRadius: 999,
    lineHeight: 1.1,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    transition: 'color .15s, background .15s',
    color: on ? '#fff' : 'currentColor',
    background: on ? 'var(--x-color-primary-600)' : 'transparent',
    opacity: on ? 1 : 0.6,
  })

  return (
    <div role="group" aria-label="Documentation provider" style={{ display: 'inline-flex', gap: 2 }}>
      <Link href={UNOFFICIAL_HOME} style={pill(!isOfficial)} aria-current={isOfficial ? undefined : 'page'}>
        🔗 Unofficial
      </Link>
      <Link href={OFFICIAL_HOME} style={pill(isOfficial)} aria-current={isOfficial ? 'page' : undefined}>
        ☁️ Official
      </Link>
    </div>
  )
}
