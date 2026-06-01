import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'

const GA_ID = 'G-B76YYS1K85'
const basePath = process.env.DOCS_BASE_PATH ?? '/zaileys'
const logoSrc = `${basePath}/zaileys-clean.png`

export const metadata = {
  title: {
    default: 'Zaileys — Simplified WhatsApp API',
    template: '%s — Zaileys',
  },
  description: 'Type-safe, batteries-included WhatsApp bot framework for Node.js / TypeScript built on Baileys.',
  icons: { icon: logoSrc, apple: logoSrc },
  verification: {
    google: 'k0WKK9pKRwONXog26MOpUJG9e3FNniwBf0SaR9OD4pw',
  },
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
  </Navbar>
)
const footer = <Footer>MIT {new Date().getFullYear()} © Zaileys.</Footer>

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
