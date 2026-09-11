// Remembers the reader's Unofficial/Official tab choice across pages; Mintlify only syncs tabs within one page.
;(() => {
  const KEY = 'zaileys:mode'
  const MODES = ['Unofficial', 'Official']
  const read = () => {
    try {
      return localStorage.getItem(KEY)
    } catch {
      return null
    }
  }
  const write = (mode) => {
    try {
      localStorage.setItem(KEY, mode)
    } catch {}
  }
  const modeOf = (el) => {
    const title = el?.textContent.trim()
    return MODES.includes(title) ? title : null
  }

  // Only trusted clicks count, so our own programmatic clicks never overwrite the stored choice.
  document.addEventListener(
    'click',
    (e) => {
      const tab = e.target instanceof Element ? e.target.closest('[role="tab"]') : null
      const mode = modeOf(tab)
      if (e.isTrusted && mode) write(mode)
    },
    true,
  )
  // Arrow keys move the selection inside a tablist without a click event.
  document.addEventListener('keyup', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
    const list = e.target instanceof Element ? e.target.closest('[role="tablist"]') : null
    const mode = modeOf(list?.querySelector('[role="tab"][aria-selected="true"]'))
    if (mode) write(mode)
  })

  const clicked = new WeakSet()
  let queued = false
  const apply = () => {
    queued = false
    const want = read()
    if (!want) return
    const tab = [...document.querySelectorAll('[role="tab"]')].find(
      (t) => modeOf(t) === want && t.getAttribute('aria-selected') !== 'true' && !clicked.has(t),
    )
    if (!tab) return
    // One click per element at most: guards against a loop if a tab ever refuses to select.
    clicked.add(tab)
    tab.click()
  }
  new MutationObserver(() => {
    if (!queued) {
      queued = true
      requestAnimationFrame(apply)
    }
  }).observe(document.documentElement, { childList: true, subtree: true })
  apply()
})()
