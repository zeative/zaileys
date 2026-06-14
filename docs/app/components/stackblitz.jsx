'use client'

import sdk from '@stackblitz/sdk'

const PKG = (deps) =>
  JSON.stringify(
    {
      name: 'zaileys-example',
      type: 'module',
      scripts: { start: 'tsx index.ts' },
      dependencies: { zaileys: 'latest', tsx: 'latest', ...deps },
    },
    null,
    2,
  ) + '\n'

const README = `# Zaileys example

Runs in StackBlitz WebContainer (Node). Pure-JS paths (connect, events, text)
work here; media/sticker features need native ffmpeg and won't run in-browser —
use them locally instead. Docs: https://zeative.github.io/zaileys
`

export default function StackBlitz({ code, title = 'Zaileys example', description = 'Runnable Zaileys snippet', deps, label = 'Open in StackBlitz' }) {
  const open = () =>
    sdk.openProject(
      {
        title,
        description,
        template: 'node',
        files: {
          'index.ts': code.trim() + '\n',
          'package.json': PKG(deps),
          'README.md': README,
        },
      },
      { newWindow: true, openFile: 'index.ts' },
    )

  return (
    <button
      onClick={open}
      title="Open this example in StackBlitz"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.45rem 0.85rem',
        marginTop: '0.5rem',
        fontSize: '0.85rem',
        fontWeight: 600,
        color: '#fff',
        background: '#1389fd',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M10.797 14.182H3.635L16.728 0l-3.525 9.818h7.162L7.272 24l3.525-9.818z" />
      </svg>
      {label}
    </button>
  )
}
