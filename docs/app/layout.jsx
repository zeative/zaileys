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
  />
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
