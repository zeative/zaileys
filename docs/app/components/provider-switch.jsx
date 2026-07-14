'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

const OFFICIAL_PREFIX = '/official'
const UNOFFICIAL_HOME = '/getting-started'
const OFFICIAL_HOME = '/official'

/**
 * Segmented selector in the navbar that switches between the two documentation trees.
 * "Official" is active whenever the path is under /official; everything else is unofficial.
 */
export function ProviderSwitch() {
  const pathname = usePathname() ?? ''
  const clean = pathname.replace(/^\/zaileys/, '') || '/'
  const isOfficial = clean === OFFICIAL_PREFIX || clean.startsWith(`${OFFICIAL_PREFIX}/`)

  const base = {
    padding: '0.28rem 0.7rem',
    fontSize: '0.8rem',
    fontWeight: 600,
    borderRadius: 6,
    lineHeight: 1.1,
    textDecoration: 'none',
    transition: 'background 0.15s, color 0.15s',
    whiteSpace: 'nowrap',
  }
  const active = { ...base, background: 'var(--x-color-primary-600, #16a34a)', color: '#fff' }
  const idle = { ...base, background: 'transparent', color: 'var(--x-color-gray-500, #6b7280)' }

  return (
    <div
      role="group"
      aria-label="Documentation provider"
      style={{
        display: 'inline-flex',
        gap: 2,
        padding: 2,
        borderRadius: 8,
        border: '1px solid var(--x-color-gray-200, rgba(128,128,128,0.25))',
        background: 'var(--x-color-gray-50, rgba(128,128,128,0.06))',
      }}
    >
      <Link href={UNOFFICIAL_HOME} style={isOfficial ? idle : active} aria-current={isOfficial ? undefined : 'page'}>
        🔗 Unofficial
      </Link>
      <Link href={OFFICIAL_HOME} style={isOfficial ? active : idle} aria-current={isOfficial ? 'page' : undefined}>
        ☁️ Official
      </Link>
    </div>
  )
}
