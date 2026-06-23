import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'

const GA_ID = 'G-B76YYS1K85'
const basePath = process.env.DOCS_BASE_PATH ?? '/zaileys'
const SITE_URL = process.env.DOCS_SITE_URL ?? 'https://zeative.github.io/zaileys'
const logoSrc = `${basePath}/zaileys-clean.png`
const ogImage = 'https://repository-images.githubusercontent.com/982777390/83fdf9a5-8357-4a53-ade6-883355d77051'
const logoUrl = `${SITE_URL}/zaileys-clean.png`

const DESCRIPTION =
  'Zaileys is a type-safe, batteries-included WhatsApp bot framework for Node.js and TypeScript built on Baileys — send messages, interactive buttons, AIRich markdown, run commands, broadcast, and persist sessions with pluggable storage.'

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Zaileys — Simplified WhatsApp API for Node.js & TypeScript',
    template: '%s — Zaileys',
  },
  description: DESCRIPTION,
  applicationName: 'Zaileys',
  generator: 'Nextra',
  authors: [{ name: 'zaadevofc', url: 'https://github.com/zeative' }],
  creator: 'zaadevofc',
  publisher: 'Zeative Labs',
  category: 'technology',
  keywords: [
    'zaileys',
    'whatsapp',
    'whatsapp api',
    'whatsapp bot',
    'baileys',
    'whatsapp typescript',
    'whatsapp nodejs',
    'whatsapp library',
    'whatsapp automation',
    'whatsapp framework',
    'multi-device whatsapp',
  ],
  icons: { icon: logoSrc, apple: logoSrc, shortcut: logoSrc },
  manifest: `${basePath}/manifest.webmanifest`,
  alternates: { canonical: `${SITE_URL}/` },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: `${SITE_URL}/`,
    siteName: 'Zaileys',
    title: 'Zaileys — Simplified WhatsApp API for Node.js & TypeScript',
    description: DESCRIPTION,
    images: [{ url: ogImage, width: 1280, height: 640, alt: 'Zaileys — Simplified WhatsApp API' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Zaileys — Simplified WhatsApp API for Node.js & TypeScript',
    description: DESCRIPTION,
    images: [ogImage],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  verification: {
    google: 'k0WKK9pKRwONXog26MOpUJG9e3FNniwBf0SaR9OD4pw',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#org`,
      name: 'Zaileys',
      url: SITE_URL,
      logo: logoUrl,
      sameAs: [
        'https://github.com/zeative/zaileys',
        'https://discord.gg/KBHhTTVUc5',
        'https://www.npmjs.com/package/zaileys',
      ],
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: 'Zaileys',
      description: DESCRIPTION,
      publisher: { '@id': `${SITE_URL}/#org` },
      inLanguage: 'en',
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/#software`,
      name: 'Zaileys',
      description: DESCRIPTION,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Node.js, Bun, Deno',
      programmingLanguage: 'TypeScript',
      url: SITE_URL,
      downloadUrl: 'https://www.npmjs.com/package/zaileys',
      license: 'https://github.com/zeative/zaileys/blob/main/LICENSE',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      publisher: { '@id': `${SITE_URL}/#org` },
    },
  ],
}

const navbar = (
  <Navbar
    logo={
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
        <img src={logoSrc} alt="Zaileys" width={28} height={28} style={{ borderRadius: 6 }} />
        <b>Zaileys</b>
      </span>
    }
    projectLink="https://github.com/zeative/zaileys"
    chatLink="https://discord.gg/KBHhTTVUc5"
  >
    <a
      href="https://chat.whatsapp.com/GlQfvc83mSH3F6ov06vuCt"
      target="_blank"
      rel="noreferrer"
      title="WhatsApp Group"
      style={{ display: 'inline-flex', alignItems: 'center', padding: '0.25rem' }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="#25D366" aria-label="WhatsApp">
        <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.728-.999zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z" />
      </svg>
    </a>
    <a
      href="https://context7.com/zeative/zaileys"
      target="_blank"
      rel="noreferrer"
      title="Context7 — LLM-ready docs"
      style={{ display: 'inline-flex', alignItems: 'center', padding: '0.25rem' }}
    >
      <img src="https://context7.com/favicon.ico" alt="Context7" width={20} height={20} style={{ borderRadius: 4 }} />
    </a>
    <a
      href="https://deepwiki.com/zeative/zaileys"
      target="_blank"
      rel="noreferrer"
      title="Ask DeepWiki"
      style={{ display: 'inline-flex', alignItems: 'center', padding: '0.25rem' }}
    >
      <img src="https://deepwiki.com/favicon.ico" alt="DeepWiki" width={20} height={20} style={{ borderRadius: 4 }} />
    </a>
  </Navbar>
)
const FOOTER_COLS = [
  {
    title: 'Documentation',
    links: [
      ['Getting Started', `${basePath}/getting-started`],
      ['Sending Messages', `${basePath}/sending-messages`],
      ['Events & Context', `${basePath}/events`],
      ['API Reference', `${basePath}/api-reference`],
    ],
  },
  {
    title: 'Resources',
    links: [
      ['AI Skill', `${basePath}/skill`],
      ['Utilities', `${basePath}/utilities`],
      ['Storage Adapters', `${basePath}/storage`],
      ['Troubleshooting', `${basePath}/troubleshooting`],
    ],
  },
  {
    title: 'Project',
    links: [
      ['GitHub', 'https://github.com/zeative/zaileys'],
      ['npm', 'https://www.npmjs.com/package/zaileys'],
      ['llms.txt', `${basePath}/llms.txt`],
      ['llms-full.txt', `${basePath}/llms-full.txt`],
    ],
  },
]

const newTab = { target: '_blank', rel: 'noopener noreferrer' }

const footer = (
  <Footer>
    <style>{`
      .zl-footer{width:100%;display:flex;flex-direction:column;gap:2.5rem}
      .zl-footer-top{display:grid;grid-template-columns:1.7fr 1fr 1fr 1fr;gap:2.25rem 1.5rem}
      .zl-footer-brand{display:flex;flex-direction:column;gap:.85rem;max-width:23rem}
      .zl-footer-logo{display:inline-flex;align-items:center;gap:.55rem;font-weight:600;font-size:1.05rem;text-decoration:none;letter-spacing:-0.01em}
      .zl-footer-logo img{width:30px;height:30px;border-radius:8px}
      .zl-footer-tag{margin:0;font-size:.85rem;line-height:1.55;opacity:.62}
      .zl-footer-meta{font-size:.74rem;opacity:.42;font-variant-numeric:tabular-nums}
      .zl-footer-col h4{margin:0 0 1rem;font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.13em;opacity:.5}
      .zl-footer-col ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.62rem}
      .zl-footer-col a{font-size:.86rem;text-decoration:none;opacity:.68;transition:opacity .15s ease}
      .zl-footer-col a:hover{opacity:1}
      .zl-footer-bottom{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.75rem;padding-top:1.5rem;border-top:1px solid var(--nextra-border-color,rgba(127,127,127,.18));font-size:.78rem;opacity:.6}
      .zl-footer-bottom a{text-decoration:none;opacity:.85}
      .zl-footer-bottom a:hover{opacity:1}
      @media (max-width:768px){.zl-footer-top{grid-template-columns:1fr 1fr}.zl-footer-brand{grid-column:1/-1}}
      @media (max-width:460px){.zl-footer-top{grid-template-columns:1fr}}
    `}</style>
    <div className="zl-footer">
      <div className="zl-footer-top">
        <div className="zl-footer-brand">
          <a className="zl-footer-logo" href={`${basePath}/`} {...newTab}>
            <img src={logoSrc} alt="Zaileys logo" />
            Zaileys
          </a>
          <p className="zl-footer-tag">
            Type-safe, batteries-included WhatsApp bot framework for Node.js &amp; TypeScript, built on Baileys.
          </p>
          <span className="zl-footer-meta">Runs on Node 20+, Bun, Deno, Termux</span>
        </div>
        {FOOTER_COLS.map((col) => (
          <nav className="zl-footer-col" key={col.title} aria-label={col.title}>
            <h4>{col.title}</h4>
            <ul>
              {col.links.map(([label, href]) => (
                <li key={href}>
                  <a href={href} {...newTab}>
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="zl-footer-bottom">
        <span>MIT {new Date().getFullYear()} © Zaileys.</span>
        <a href="https://github.com/WhiskeySockets/Baileys" {...newTab}>
          Built on Baileys
        </a>
      </div>
    </div>
  </Footer>
)

export default async function RootLayout({ children }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head>
        <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');`,
          }}
        />
      </Head>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <Layout
          navbar={navbar}
          footer={footer}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/zeative/zaileys/tree/main/docs"
          sidebar={{ defaultMenuCollapseLevel: 1 }}
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}
