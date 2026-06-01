import { generateStaticParamsFor, importPage } from 'nextra/pages'
import { useMDXComponents as getMDXComponents } from '../../mdx-components'

const SITE_URL = process.env.DOCS_SITE_URL ?? 'https://zeative.github.io/zaileys'
const OG_IMAGE = 'https://repository-images.githubusercontent.com/982777390/83fdf9a5-8357-4a53-ade6-883355d77051'

export const generateStaticParams = generateStaticParamsFor('mdxPath')

const pageUrl = (mdxPath) => {
  const slug = (mdxPath ?? []).join('/')
  return slug ? `${SITE_URL}/${slug}` : SITE_URL
}

const titleText = (metadata) => {
  const t = metadata?.title
  if (typeof t === 'string') return t
  if (t && typeof t === 'object') return t.absolute ?? t.default ?? 'Zaileys'
  return 'Zaileys'
}

export async function generateMetadata(props) {
  const params = await props.params
  const { metadata } = await importPage(params.mdxPath)
  const url = pageUrl(params.mdxPath)
  return {
    ...metadata,
    alternates: { ...metadata?.alternates, canonical: url },
    openGraph: { ...metadata?.openGraph, url, type: 'article', images: [{ url: OG_IMAGE, width: 1280, height: 640, alt: 'Zaileys' }] },
    twitter: { ...metadata?.twitter, card: 'summary_large_image', images: [OG_IMAGE] },
  }
}

const Wrapper = getMDXComponents().wrapper

export default async function Page(props) {
  const params = await props.params
  const result = await importPage(params.mdxPath)
  const { default: MDXContent, toc, metadata, sourceCode } = result
  const url = pageUrl(params.mdxPath)
  const name = titleText(metadata)
  const isHome = !(params.mdxPath ?? []).length

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        '@id': `${url}#article`,
        headline: name,
        name,
        description: metadata?.description,
        url,
        inLanguage: 'en',
        isPartOf: { '@id': `${SITE_URL}/#website` },
        publisher: { '@id': `${SITE_URL}/#org` },
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: isHome
          ? [{ '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL }]
          : [
              { '@type': 'ListItem', position: 1, name: 'Docs', item: SITE_URL },
              { '@type': 'ListItem', position: 2, name, item: url },
            ],
      },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
        <MDXContent {...props} params={params} />
      </Wrapper>
    </>
  )
}
