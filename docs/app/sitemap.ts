import type { MetadataRoute } from 'next'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SITE_URL = process.env.DOCS_SITE_URL ?? 'https://zeative.github.io/zaileys'
const contentDir = join(process.cwd(), 'content')

const HIGH = new Set(['getting-started', 'installation', 'configuration'])

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  const files = readdirSync(contentDir).filter((f) => f.endsWith('.mdx'))
  return files.map((file) => {
    const slug = file.replace(/\.mdx$/, '')
    const isHome = slug === 'index'
    const lastModified = statSync(join(contentDir, file)).mtime
    return {
      url: isHome ? `${SITE_URL}/` : `${SITE_URL}/${slug}/`,
      lastModified,
      changeFrequency: isHome ? 'daily' : 'weekly',
      priority: isHome ? 1 : HIGH.has(slug) ? 0.9 : 0.8,
    }
  })
}
