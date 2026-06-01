import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'

export const metadata = {
  title: {
    default: 'Zaileys — Simplified WhatsApp API',
    template: '%s — Zaileys',
  },
  description: 'Type-safe, batteries-included WhatsApp bot framework for Node.js / TypeScript built on Baileys.',
}

const navbar = (
  <Navbar logo={<b>Zaileys</b>} projectLink="https://github.com/zeative/zaileys" chatLink="https://discord.gg/KBHhTTVUc5" />
)
const footer = <Footer>MIT {new Date().getFullYear()} © Zaileys.</Footer>

export default async function RootLayout({ children }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head />
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
