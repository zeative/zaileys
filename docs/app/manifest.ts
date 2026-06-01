import type { MetadataRoute } from 'next'

const basePath = process.env.DOCS_BASE_PATH ?? '/zaileys'

export const dynamic = 'force-static'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Zaileys — Simplified WhatsApp API',
    short_name: 'Zaileys',
    description:
      'Type-safe, batteries-included WhatsApp bot framework for Node.js and TypeScript built on Baileys.',
    start_url: `${basePath}/`,
    scope: `${basePath}/`,
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      { src: `${basePath}/zaileys-clean.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${basePath}/zaileys-clean.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
