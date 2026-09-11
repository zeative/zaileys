// Which providers a page's feature works on. Shape (✓ ✗ ◐) and text carry the meaning; color only reinforces it.
export const ProviderSupport = ({ web = true, cloud = true, note }) => {
  const status = (value) => (value === 'partial' ? 'Partial support' : value ? 'Supported' : 'Not available')
  const mark = (value) => (value === 'partial' ? '◐' : value ? '✓' : '✗')
  const tone = (value) =>
    value === 'partial'
      ? 'border-amber-500/50 text-amber-800 dark:text-amber-300'
      : value
        ? 'border-emerald-600/50 text-emerald-800 dark:text-emerald-300'
        : 'border-zinc-400/50 text-zinc-500 dark:text-zinc-400'
  const items = [
    { name: 'WhatsApp Web', href: '/providers', value: web },
    { name: 'Cloud API', href: '/cloud/overview', value: cloud },
  ]
  return (
    <div className="not-prose my-4 flex flex-wrap items-center gap-2">
      {items.map(({ name, href, value }) => (
        <a
          key={name}
          href={href}
          title={`${name}: ${status(value)}`}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium no-underline ${tone(value)}`}
        >
          <span aria-hidden="true">{mark(value)}</span>
          <span>{name}</span>
          <span className="sr-only">: {status(value)}</span>
        </a>
      ))}
      {note ? <span className="text-xs text-zinc-500 dark:text-zinc-400">{note}</span> : null}
    </div>
  )
}
