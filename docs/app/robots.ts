import type { MetadataRoute } from 'next'

const SITE_URL = process.env.DOCS_SITE_URL ?? 'https://zeative.github.io/zaileys'

export const dynamic = 'force-static'

export default function robots(): MetadataRoute.Robots {
  const aiBots = [
    'GPTBot',
    'OAI-SearchBot',
    'ChatGPT-User',
    'ClaudeBot',
    'Claude-Web',
    'anthropic-ai',
    'PerplexityBot',
    'Google-Extended',
    'CCBot',
    'Applebot-Extended',
    'cohere-ai',
    'Bytespider',
  ]
  return {
    rules: [
      { userAgent: '*', allow: '/' },
      ...aiBots.map((userAgent) => ({ userAgent, allow: '/' })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
