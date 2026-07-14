import { PHASE_PRODUCTION_BUILD } from 'next/constants.js'
import nextra from 'nextra'

const withNextra = nextra({})

// GitHub Pages project site: https://zeative.github.io/zaileys
// `output: 'export'` + static basePath. Override the prefix with DOCS_BASE_PATH
// (set to '' for a custom domain / user page).
const basePath = process.env.DOCS_BASE_PATH ?? '/zaileys'

// Next 15.5 `output: 'export'` + optional catch-all `[[...mdxPath]]` throws a false
// "missing param" error under `next dev`. Gate the static export on the build phase so
// every build worker sees it consistently while `next dev` runs without it.
export default (phase) =>
  withNextra({
    ...(phase === PHASE_PRODUCTION_BUILD ? { output: 'export' } : {}),
    images: { unoptimized: true },
    basePath,
    env: { NEXT_PUBLIC_BASE_PATH: basePath },
    // Static export + basePath: trailingSlash makes the index RSC prefetch payload
    // resolve to `${basePath}/index.txt` instead of the 404-ing `${basePath}.txt`.
    trailingSlash: true,
  })
