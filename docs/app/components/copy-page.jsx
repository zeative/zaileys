'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

function slugFrom(pathname) {
  const seg = (pathname || '/').replace(/\/+$/, '').split('/').filter(Boolean)
  return seg.length ? seg[seg.length - 1] : 'index'
}

const Ico = ({ d, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden>
    <path d={d} />
  </svg>
)
const I = {
  copy: 'M9 9h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  check: 'M20 6 9 17l-5-5',
  md: 'M3 5h18v14H3zM7 15V9l3 3 3-3v6M17 9v4m0 0-2-2m2 2 2-2',
  chevron: 'm6 9 6 6 6-6',
  ext: 'M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5',
  chat: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
}

const AIS = [
  { name: 'ChatGPT', url: 'https://chatgpt.com/?q=', domain: 'chatgpt.com' },
  { name: 'Claude', url: 'https://claude.ai/new?q=', domain: 'claude.ai' },
  { name: 'Perplexity', url: 'https://www.perplexity.ai/search?q=', domain: 'perplexity.ai' },
  { name: 'Grok', url: 'https://grok.com/?q=', domain: 'grok.com' },
  { name: 'Gemini', url: 'https://gemini.google.com/app?q=', domain: 'gemini.google.com' },
]
const favicon = (domain) => `https://www.google.com/s2/favicons?domain=${domain}&sz=64`

const BORDER = 'light-dark(rgba(0,0,0,0.12), rgba(255,255,255,0.14))'
const HOVER = 'light-dark(rgba(0,0,0,0.05), rgba(255,255,255,0.07))'
const MENU_BG = 'light-dark(#ffffff, #1c1c1f)'
const MUTED = 'light-dark(#52525b, #a1a1aa)'

function writeClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text)
  }
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    try {
      document.execCommand('copy') ? resolve() : reject(new Error('execCommand failed'))
    } catch (e) {
      reject(e)
    } finally {
      document.body.removeChild(ta)
    }
  })
}

export default function CopyPage() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef(null)
  const mdRef = useRef(null)

  const slug = slugFrom(pathname)
  const mdUrl = `${BASE}/md/${slug}.md`
  const pageUrl = typeof window !== 'undefined' ? window.location.href : ''
  const absMd = typeof window !== 'undefined' ? `${window.location.origin}${mdUrl}` : mdUrl
  const prompt = `Read ${pageUrl} (raw markdown: ${absMd}) — a Zaileys documentation page — then help me with it.`

  useEffect(() => {
    const onDoc = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('click', onDoc)
    let alive = true
    fetch(mdUrl)
      .then((r) => (r.ok ? r.text() : null))
      .then((t) => alive && (mdRef.current = t))
      .catch(() => {})
    return () => {
      alive = false
      document.removeEventListener('click', onDoc)
    }
  }, [mdUrl])

  const copy = async () => {
    setOpen(false)
    let text = mdRef.current
    try {
      if (!text) text = await (await fetch(mdUrl)).text()
      await writeClipboard(text)
    } catch {
      try {
        await writeClipboard(pageUrl)
      } catch {
        return
      }
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const item = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    width: '100%',
    padding: '0.5rem 0.65rem',
    fontSize: '0.82rem',
    lineHeight: 1.2,
    background: 'transparent',
    border: 'none',
    color: 'inherit',
    cursor: 'pointer',
    textDecoration: 'none',
    textAlign: 'left',
    borderRadius: 7,
    whiteSpace: 'nowrap',
  }
  const hov = (e, on) => (e.currentTarget.style.background = on ? HOVER : 'transparent')

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', colorScheme: 'light dark' }}>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'stretch',
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          overflow: 'hidden',
          fontSize: '0.78rem',
          fontWeight: 500,
        }}
      >
        <button
          onClick={copy}
          title="Copy this page as Markdown for LLMs"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.34rem 0.65rem', background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', transition: 'background 0.12s' }}
          onMouseEnter={(e) => hov(e, true)}
          onMouseLeave={(e) => hov(e, false)}
        >
          <Ico d={copied ? I.check : I.copy} size={13} />
          {copied ? 'Copied!' : 'Copy page'}
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="More options"
          style={{ display: 'inline-flex', alignItems: 'center', padding: '0.34rem 0.4rem', background: 'transparent', border: 'none', borderLeft: `1px solid ${BORDER}`, color: MUTED, cursor: 'pointer', transition: 'background 0.12s' }}
          onMouseEnter={(e) => hov(e, true)}
          onMouseLeave={(e) => hov(e, false)}
        >
          <Ico d={I.chevron} size={13} />
        </button>
      </div>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 7px)',
            right: 0,
            zIndex: 50,
            minWidth: 215,
            padding: 5,
            background: MENU_BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 11,
            boxShadow: '0 10px 34px rgba(0,0,0,0.18)',
          }}
        >
          <button style={item} onMouseEnter={(e) => hov(e, true)} onMouseLeave={(e) => hov(e, false)} onClick={copy}>
            <Ico d={I.copy} /> Copy page as Markdown
          </button>
          <a style={item} onMouseEnter={(e) => hov(e, true)} onMouseLeave={(e) => hov(e, false)} href={mdUrl} target="_blank" rel="noreferrer">
            <Ico d={I.md} /> View as Markdown
            <span style={{ marginLeft: 'auto', color: MUTED }}><Ico d={I.ext} size={12} /></span>
          </a>
          <div style={{ height: 1, background: BORDER, margin: '4px 6px' }} />
          <div style={{ padding: '0.3rem 0.65rem 0.2rem', fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: MUTED }}>Open in</div>
          {AIS.map((ai) => (
            <a key={ai.name} style={item} onMouseEnter={(e) => hov(e, true)} onMouseLeave={(e) => hov(e, false)} href={`${ai.url}${encodeURIComponent(prompt)}`} target="_blank" rel="noreferrer">
              <img src={favicon(ai.domain)} alt="" width={15} height={15} style={{ borderRadius: 3, flexShrink: 0 }} />
              {ai.name}
              <span style={{ marginLeft: 'auto', color: MUTED }}><Ico d={I.ext} size={12} /></span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
