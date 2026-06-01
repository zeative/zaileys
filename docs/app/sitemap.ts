import type { MetadataRoute } from 'next'

const SITE_URL = process.env.DOCS_SITE_URL ?? 'https://zeative.github.io/zaileys'

const PAGES = [
  '',
  'installation',
  'getting-started',
  'configuration',
  'client',
  'events',
  'sending-messages',
  'media',
  'interactive',
  'rich-responses',
  'commands',
  'automation',
  'storage',
  'error-handling',
  'runtimes',
  'troubleshooting',
  'api-reference',
  'skill',
]

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  return PAGES.map((slug) => ({
    url: slug ? `${SITE_URL}/${slug}/` : `${SITE_URL}/`,
    lastModified,
    changeFrequency: slug ? 'weekly' : 'daily',
    priority: slug ? (['getting-started', 'installation'].includes(slug) ? 0.9 : 0.8) : 1,
  }))
}
