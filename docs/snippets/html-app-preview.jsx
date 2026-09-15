// Runs a template card in the browser under the limits WhatsApp Android applies: the same CSP (no network), an opaque
// origin (storage throws), a fixed height with no scroll, and the card width measured on a phone.
export const HtmlAppPreview = ({ doc, height = 320, title = 'HTML app' }) => {
  const widths = [
    { id: 'phone', label: 'Phone', px: 438, hint: 'Width measured on an Android phone' },
    { id: 'narrow', label: 'Narrow', px: 320, hint: 'A narrower phone, to check the layout still fits' },
  ]
  const [width, setWidth] = useState('phone')
  const [run, setRun] = useState(0)
  const current = widths.find((w) => w.id === width) ?? widths[0]
  const csp =
    "default-src 'none'; connect-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:;"
  const lock = `<style>html,body{margin:0;height:${height}px;max-height:${height}px;overflow:hidden}</style>`
  const bytes = Uint8Array.from(atob(doc), (c) => c.charCodeAt(0))
  const markup = new TextDecoder().decode(bytes)
  const srcDoc = `<meta http-equiv="Content-Security-Policy" content="${csp}">${lock}${markup}`
  const button = (active) =>
    `rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
      active
        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
        : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
    }`

  return (
    <figure className="not-prose my-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Preview width" className="inline-flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-800">
          {widths.map((w) => (
            <button key={w.id} type="button" title={w.hint} aria-pressed={w.id === width} onClick={() => setWidth(w.id)} className={button(w.id === width)}>
              {w.label} · {w.px} px
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setRun((n) => n + 1)}
          className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Restart
        </button>
      </div>
      <div className="overflow-x-auto pb-1">
        <div style={{ width: current.px + 16 }} className="rounded-2xl rounded-tl-sm bg-[#e9edef] p-2 shadow-sm dark:bg-[#1f2c34]">
          <div className="flex items-center gap-1.5 px-1 pb-1.5 text-xs text-zinc-600 dark:text-zinc-400">
            <span aria-hidden="true">ⓘ</span>
            <span className="truncate">{title}</span>
          </div>
          <iframe
            key={`${width}-${run}`}
            title={`${title} preview`}
            sandbox="allow-scripts"
            srcDoc={srcDoc}
            width={current.px}
            height={height}
            style={{ width: current.px, height, border: 0, display: 'block', borderRadius: 10, background: '#000' }}
          />
        </div>
      </div>
      <figcaption className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        Runs in your browser with the card's limits: no network, no storage, no scrolling, {height} px tall.
      </figcaption>
    </figure>
  )
}
