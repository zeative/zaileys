// Docs search: BM25F ranking over an index built from the .mdx sources.
// Mintlify auto-loads this on every page, so it works in `mint dev` and in the static export.
;(() => {
  const INDEX_URL = '/search-index.json'
  const RECENT_KEY = 'zaileys:recent-search'
  const MAX_RESULTS = 12
  const SUGGESTED = [
    { t: 'Quickstart', u: '/quickstart' },
    { t: 'Send media', u: '/messaging/media' },
    { t: 'Feature matrix', u: '/feature-matrix' },
    { t: 'Troubleshooting', u: '/reference/troubleshooting' },
  ]

  let data = null
  let loading = null
  let modal, input, list, status, results = [], active = 0, lastFocused

  const loadIndex = () => {
    if (data) return Promise.resolve(data)
    if (!loading) {
      loading = fetch(INDEX_URL)
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
        .then((json) => (data = json))
        .catch(() => (data = null))
    }
    return loading
  }

  const recent = {
    read() {
      try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] }
    },
    add(term) {
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify([term, ...recent.read().filter((t) => t !== term)].slice(0, 5)))
      } catch {}
    },
  }

  const escape = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

  const mark = (text, words) => {
    let out = escape(text)
    for (const word of [...words].sort((a, b) => b.length - a.length)) {
      out = out.replace(new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>')
    }
    return out
  }
  // ---- query understanding -------------------------------------------------
  const STOP = new Set('the a an and or of to in for on is are be with you your it this that as at by from can will not'.split(' '))

  // Indonesian (and shorthand) → the English words the docs actually use.
  const SYNONYMS = {
    kirim: ['send'], mengirim: ['send'], ngirim: ['send'], pesan: ['message'], balas: ['reply'], membalas: ['reply'],
    gambar: ['image', 'photo'], foto: ['image', 'photo'], pic: ['image'], photo: ['image'], suara: ['audio', 'voice'],
    rekaman: ['audio', 'voice'], berkas: ['document', 'file'], dokumen: ['document'], stiker: ['sticker'],
    grup: ['group'], kelompok: ['group'], saluran: ['newsletter', 'channel'], kontak: ['contact'],
    hapus: ['delete'], ubah: ['edit'], sunting: ['edit'], sambung: ['connect'], koneksi: ['connection'],
    masuk: ['login', 'auth'], keluar: ['logout'], galat: ['error'], kesalahan: ['error'], contoh: ['example'],
    pengaturan: ['configuration', 'option'], setelan: ['configuration'], tombol: ['button'], daftar: ['list'],
    sematkan: ['pin'], bisu: ['mute'], arsip: ['archive'], blokir: ['block'], jadwal: ['schedule'],
    siaran: ['broadcast'], sesi: ['session'], nomor: ['phone', 'number'], berapa: [], bagaimana: [], cara: [],
    msg: ['message'], docs: ['documentation'], cfg: ['configuration'], btn: ['button'],
    // Two-way pairs: the docs use one word, readers type the other.
    image: ['photo'], video: ['clip'], audio: ['voice'], voice: ['audio'], file: ['document'],
    document: ['file'], channel: ['newsletter'], newsletter: ['channel'],
  }

  const stem = (w) => {
    if (w.length > 5 && w.endsWith('ies')) return `${w.slice(0, -3)}y`
    if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2)
    if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
    if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3)
    if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2)
    return w
  }

  const tokenizeQuery = (text) => {
    const out = []
    for (const raw of String(text).split(/[^A-Za-z0-9_]+/)) {
      if (!raw) continue
      const lower = raw.toLowerCase()
      if (lower.length > 1 && !STOP.has(lower)) out.push(lower)
      const parts = raw.split(/(?<=[a-z0-9])(?=[A-Z])/)
      if (parts.length > 1) for (const p of parts) { const s = p.toLowerCase(); if (s.length > 1) out.push(s) }
    }
    return out
  }

  // Bounded edit distance: bail out as soon as it can't beat `max`.
  const withinEdits = (a, b, max) => {
    if (Math.abs(a.length - b.length) > max) return false
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
    for (let i = 1; i <= a.length; i++) {
      const row = [i]
      let best = i
      for (let j = 1; j <= b.length; j++) {
        row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
        if (row[j] < best) best = row[j]
      }
      if (best > max) return false
      prev = row
    }
    return prev[b.length] <= max
  }

  // One query word becomes several weighted variants: exact, stem, synonym, prefix, typo.
  const expand = (word, terms, isLast) => {
    const variants = new Map()
    const add = (term, weight) => {
      if (data.df[term] && (variants.get(term) ?? 0) < weight) variants.set(term, weight)
    }
    add(word, 1)
    add(stem(word), 0.98)
    for (const syn of SYNONYMS[word] ?? []) { add(syn, 0.85); add(stem(syn), 0.84) }

    // Prefix-expand only the word still being typed; doing it to every word makes
    // "send" drag in "sender" and hijack the ranking.
    if (isLast || !variants.size) {
      let prefixHits = 0
      for (const term of terms) {
        if (prefixHits >= 10) break
        if (term.length > word.length && term.startsWith(word)) { add(term, 0.45); prefixHits++ }
      }
    }
    if (!variants.size && word.length >= 4) {
      const max = word.length >= 7 ? 2 : 1
      for (const term of terms) {
        if (Math.abs(term.length - word.length) <= max && term[0] === word[0] && withinEdits(word, term, max)) {
          add(term, 0.6)
        }
      }
    }
    return variants
  }

  // ---- BM25F scoring -------------------------------------------------------
  const search = (query) => {
    if (!data) return []
    const words = tokenizeQuery(query)
    if (!words.length) return []
    const terms = data.terms || (data.terms = Object.keys(data.df))
    const k1 = data.k1 ?? 1.2
    const hiBoost = data.hiBoost ?? 3
    const scores = new Map()
    const coverage = new Map()
    const expanded = new Set() // every variant we actually searched, for heading selection

    const idfOf = (term) => Math.log(1 + (data.N - data.df[term] + 0.5) / (data.df[term] + 0.5))

    words.forEach((word, wi) => {
      const variants = expand(word, terms, wi === words.length - 1)
      if (!variants.size) return
      // A guess must never be worth more than what the reader actually typed: "code" → "codex"
      // is rare, so its IDF would otherwise outweigh the real word.
      const typed = data.df[word] ? word : data.df[stem(word)] ? stem(word) : null
      const typedIdf = typed ? idfOf(typed) : null
      for (const [term, variantWeight] of variants) {
        if (variantWeight >= 0.8) expanded.add(term)
        // Rare words carry more signal than common ones.
        const idf = variantWeight < 1 && typedIdf !== null ? Math.min(idfOf(term), typedIdf) : idfOf(term)
        data.docs.forEach((doc, di) => {
          const entry = doc.w[term]
          if (!entry) return
          const hi = entry[0]
          const bo = entry[1]
          // Each signal saturates on its own, so "named after it" always outranks "mentions it a lot".
          const sat = (x) => (x * (k1 + 1)) / (x + k1)
          const add = idf * (hiBoost * sat(hi) + sat(bo)) * variantWeight
          if (add <= 0) return
          scores.set(di, (scores.get(di) || 0) + add)
          const seen = coverage.get(di) || new Set()
          seen.add(wi)
          coverage.set(di, seen)
        })
      }
    })

    const hits = []
    for (const [di, base] of scores) {
      const doc = data.docs[di]
      const covered = (coverage.get(di) || new Set()).size
      // Short queries are a conjunction: "pairing code" must not match a page that only has "code".
      const required = words.length <= 2 ? words.length : Math.ceil(words.length * 0.7)
      if (covered < required) continue
      const ratio = covered / words.length
      let score = base * ratio * ratio

      const phrase = query.toLowerCase().trim()
      const title = doc.t.toLowerCase()
      if (title === phrase) score *= 2.2
      else if (title.startsWith(phrase)) score *= 1.7
      else if (title.includes(phrase)) score *= 1.4
      // The words next to each other mean far more than the same words scattered around.
      else if (words.length > 1) {
        const inHeading = doc.secs.some((sec) => sec.t.toLowerCase().includes(phrase))
        if (inHeading || (doc.d || '').toLowerCase().includes(phrase)) score *= 1.8
      }

      const section = bestSection(doc, words, phrase, expanded)
      if (section) score *= 1.12
      hits.push({ doc, score, section })
    }

    hits.sort((a, b) => b.score - a.score || a.doc.ti - b.doc.ti)
    return hits.slice(0, MAX_RESULTS)
  }

  // Deep-link to the most relevant heading instead of dumping the reader at the top.
  const bestSection = (doc, words, phrase, expanded) => {
    let best = null
    let bestScore = 0
    for (const sec of doc.secs) {
      const heading = sec.t.toLowerCase()
      const snippet = (sec.x || '').toLowerCase()
      let score = 0
      if (heading === phrase) score += 40
      else if (heading.includes(phrase)) score += 22
      for (const word of words) {
        const s = stem(word)
        if (heading.includes(word) || heading.includes(s)) score += 10
        else if (snippet.includes(word) || snippet.includes(s)) score += 2
      }
      // A heading that says "photo" answers a search for "image" better than one that merely mentions it.
      for (const term of expanded || []) {
        if (heading.includes(term)) score += 8
      }
      if (score > bestScore) { bestScore = score; best = sec }
    }
    return bestScore >= 10 ? best : null
  }

  // ---- rendering -----------------------------------------------------------
  const render = (query) => {
    const words = tokenizeQuery(query)
    list.innerHTML = ''
    results = []

    if (!data) {
      status.hidden = false
      status.textContent = 'Search index not built — run: pnpm docs:search'
      return
    }

    if (!query.trim()) {
      const history = recent.read()
      const rows = history.length
        ? history.map((t) => ({ label: 'Recent', title: t, term: t }))
        : SUGGESTED.map((s) => ({ label: 'Popular', title: s.t, url: s.u }))
      status.hidden = true
      for (const row of rows) {
        const item = document.createElement(row.url ? 'a' : 'button')
        item.className = 'zs-item'
        if (row.url) item.href = row.url
        item.innerHTML = `<span class="zs-crumb">${row.label}</span><span class="zs-title">${escape(row.title)}</span>`
        item.addEventListener('click', () => {
          if (row.term) { input.value = row.term; render(row.term); input.focus() } else setTimeout(close, 0)
        })
        list.appendChild(item)
        results.push({ el: item })
      }
      highlight(0)
      return
    }

    const hits = search(query)
    status.hidden = hits.length > 0
    status.textContent = `No page matches “${query}”`

    // Group by tab, but order the groups by their best hit so the top result stays on top.
    const groups = new Map()
    for (const hit of hits) {
      if (!groups.has(hit.doc.tab)) groups.set(hit.doc.tab, [])
      groups.get(hit.doc.tab).push(hit)
    }

    for (const [tab, tabHits] of [...groups].sort((a, b) => b[1][0].score - a[1][0].score)) {
      const label = document.createElement('div')
      label.className = 'zs-group'
      label.textContent = tab
      list.appendChild(label)

      for (const hit of tabHits) {
      const url = hit.section ? `${hit.doc.u}#${hit.section.a}` : hit.doc.u
      const crumb = hit.section ? `${hit.doc.g} › ${hit.doc.t}` : hit.doc.g
      const title = hit.section ? hit.section.t : hit.doc.t
      const snippet = hit.section ? hit.section.x : hit.doc.d

      const item = document.createElement('a')
      item.className = 'zs-item'
      item.href = url
      item.innerHTML =
        `<span class="zs-crumb">${escape(crumb)}</span>` +
        `<span class="zs-title">${mark(title, words)}</span>` +
        (snippet ? `<span class="zs-snippet">${mark(snippet, words)}</span>` : '')
      item.addEventListener('click', () => { recent.add(query.trim()); setTimeout(close, 0) })
      list.appendChild(item)
      results.push({ el: item })
      }
    }
    highlight(0)
  }

  const highlight = (index) => {
    if (!results.length) return
    active = (index + results.length) % results.length
    results.forEach((r, i) => r.el.classList.toggle('is-active', i === active))
    results[active].el.scrollIntoView({ block: 'nearest' })
  }

  const build = () => {
    const style = document.createElement('style')
    style.textContent = `
#zaileys-search[hidden]{display:none}
#zaileys-search{position:fixed;inset:0;z-index:1000;font-family:inherit}
#zaileys-search .zs-backdrop{position:absolute;inset:0;background:rgba(3,5,8,.62);backdrop-filter:blur(3px)}
#zaileys-search .zs-panel{position:relative;margin:9vh auto 0;max-width:640px;width:calc(100% - 2rem);
 background:#fff;border:1px solid #e5e7eb;border-radius:14px;box-shadow:0 26px 70px rgba(0,0,0,.32);
 display:flex;flex-direction:column;max-height:74vh;overflow:hidden}
html.dark #zaileys-search .zs-panel{background:#0d1013;border-color:#232a31}
#zaileys-search .zs-head{display:flex;align-items:center;gap:10px;padding:13px 16px;border-bottom:1px solid #eceff2}
html.dark #zaileys-search .zs-head{border-color:#1d2329}
#zaileys-search input{flex:1;border:0;outline:0;background:transparent;font-size:15px;color:inherit;min-width:0}
#zaileys-search .zs-esc{font-size:11px;color:#8a94a0;border:1px solid #d8dde3;border-radius:6px;padding:2px 6px}
html.dark #zaileys-search .zs-esc{border-color:#2b333b}
#zaileys-search .zs-list{overflow:auto;padding:6px}
#zaileys-search .zs-group{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8a94a0;padding:12px 10px 5px}
#zaileys-search .zs-item{display:block;width:100%;text-align:left;padding:9px 10px;border-radius:9px;
 text-decoration:none;color:inherit;border:1px solid transparent;background:none;cursor:pointer}
#zaileys-search .zs-item.is-active{background:rgba(35,127,42,.10);border-color:rgba(35,127,42,.35)}
html.dark #zaileys-search .zs-item.is-active{background:rgba(126,217,87,.12);border-color:rgba(126,217,87,.32)}
#zaileys-search .zs-crumb{display:block;font-size:11px;color:#8a94a0;margin-bottom:2px}
#zaileys-search .zs-title{display:block;font-size:14px;font-weight:600}
#zaileys-search .zs-snippet{font-size:12.5px;color:#6b7683;margin-top:3px;line-height:1.45;
 display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
html.dark #zaileys-search .zs-snippet{color:#93a0ad}
#zaileys-search mark{background:rgba(126,217,87,.22);color:inherit;border-radius:3px;padding:0 1px;font-weight:600}
#zaileys-search .zs-status{padding:26px 16px;text-align:center;color:#8a94a0;font-size:13.5px}
#zaileys-search .zs-foot{display:flex;gap:14px;padding:9px 14px;border-top:1px solid #eceff2;font-size:11.5px;color:#8a94a0}
html.dark #zaileys-search .zs-foot{border-color:#1d2329}
@media (max-width:640px){#zaileys-search .zs-panel{margin-top:4vh;max-height:86vh}#zaileys-search .zs-foot{display:none}}`
    document.head.appendChild(style)

    modal = document.createElement('div')
    modal.id = 'zaileys-search'
    modal.hidden = true
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-modal', 'true')
    modal.setAttribute('aria-label', 'Search the documentation')
    modal.innerHTML =
      '<div class="zs-backdrop"></div>' +
      '<div class="zs-panel">' +
      '<div class="zs-head"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
      '<input type="search" placeholder="Search the documentation" aria-label="Search the documentation" autocomplete="off" spellcheck="false">' +
      '<span class="zs-esc">esc</span></div>' +
      '<div class="zs-list"></div><div class="zs-status" hidden></div>' +
      '<div class="zs-foot"><span>↑↓ select</span><span>↵ open</span><span>esc close</span></div>' +
      '</div>'
    document.body.appendChild(modal)

    input = modal.querySelector('input')
    list = modal.querySelector('.zs-list')
    status = modal.querySelector('.zs-status')
    modal.querySelector('.zs-backdrop').addEventListener('click', close)
    input.addEventListener('input', () => render(input.value))
    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') { event.preventDefault(); highlight(active + 1) }
      else if (event.key === 'ArrowUp') { event.preventDefault(); highlight(active - 1) }
      else if (event.key === 'Enter' && results[active]) { event.preventDefault(); results[active].el.click() }
    })
  }

  const open = async () => {
    if (!modal) build()
    lastFocused = document.activeElement
    modal.hidden = false
    document.documentElement.style.overflow = 'hidden'
    input.focus()
    input.select()
    await loadIndex()
    render(input.value)
  }

  const close = () => {
    if (!modal || modal.hidden) return
    modal.hidden = true
    document.documentElement.style.overflow = ''
    if (lastFocused && lastFocused.focus) lastFocused.focus()
  }

  // The built-in button opens a dead "run mint login" dialog once self-hosted.
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest && event.target.closest('#search-bar-entry, #search-bar-entry-mobile')
    if (!trigger) return
    event.preventDefault()
    event.stopImmediatePropagation()
    open()
  }, true)

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && (event.key === 'k' || event.key === 'K')) {
      event.preventDefault()
      modal && !modal.hidden ? close() : open()
    } else if (event.key === 'Escape') close()
  })

  loadIndex()
})()
