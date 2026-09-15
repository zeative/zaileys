// Gallery tiles for the Templates tab. Colors are inline styles: Mintlify's CSS only ships the Tailwind classes it already uses.
// The emoji and gradient are decoration; title, category, and details carry the meaning.
export const TemplateGrid = ({ items = [] }) => {
  const gradients = {
    games: ['#7c5cff', '#ff4f8b'],
    music: ['#b44cff', '#38b6ff'],
    fun: ['#ffc93c', '#ff4f8b'],
    business: ['#2ed8a7', '#38b6ff'],
    calculators: ['#ff8a3d', '#ffc93c'],
    data: ['#38b6ff', '#7c5cff'],
  }
  return (
    <div className="not-prose my-6 grid gap-4 sm:grid-cols-2">
      {items.map((t) => (
        <a
          key={t.href}
          href={t.href}
          className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-200 no-underline transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-zinc-800"
        >
          <div
            className="flex h-24 items-center justify-center"
            style={{ backgroundImage: `linear-gradient(135deg, ${(gradients[t.category] ?? gradients.games).join(', ')})` }}
          >
            <span aria-hidden="true" className="text-5xl drop-shadow-sm transition-transform group-hover:scale-110">
              {t.emoji}
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-1.5 p-4">
            <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{t.title}</span>
            <span className="text-sm leading-snug text-zinc-600 dark:text-zinc-400">{t.description}</span>
            <span className="mt-auto pt-2 text-xs text-zinc-500 dark:text-zinc-500">
              {t.height} px tall · {t.inputs}
            </span>
          </div>
        </a>
      ))}
    </div>
  )
}
