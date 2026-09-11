// Opens a runnable Node project through StackBlitz's POST API; snippets can't import the StackBlitz SDK.
export const StackBlitz = ({ code, title = 'Zaileys example', deps = {}, label = 'Open in StackBlitz' }) => {
  const pkg = JSON.stringify(
    {
      name: 'zaileys-example',
      type: 'module',
      scripts: { start: 'tsx index.ts' },
      dependencies: { zaileys: 'latest', tsx: 'latest', ...deps },
    },
    null,
    2,
  )
  return (
    <form method="post" action="https://stackblitz.com/run?file=index.ts" target="_blank" className="not-prose my-4">
      <input type="hidden" name="project[title]" value={title} />
      <input type="hidden" name="project[description]" value="Runnable Zaileys example" />
      <input type="hidden" name="project[template]" value="node" />
      <input type="hidden" name="project[files][package.json]" value={pkg} />
      <input type="hidden" name="project[files][index.ts]" value={code} />
      <button
        type="submit"
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:border-zinc-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-500"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#1269D3" d="M10.797 14.182H3.635L16.728 0l-3.525 9.818h7.162L7.272 24l3.525-9.818Z" />
        </svg>
        {label}
        <span className="sr-only">(opens in a new tab)</span>
      </button>
    </form>
  )
}
