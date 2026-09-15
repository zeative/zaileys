import { describe, expect, it } from 'vitest'
import { SafeHtml, escapeHtml, html, htmlJson, rawHtml } from '../../src/builder/html.js'

describe('escapeHtml', () => {
  it('escapes every character that can open a tag or close an attribute', () => {
    const escaped = '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&#96;&lt;/a&gt;'
    expect(escapeHtml(`<a href="x" title='y'>&\`</a>`)).toBe(escaped)
  })

  it('leaves plain text untouched', () => {
    expect(escapeHtml('Rp54.000 · lunas')).toBe('Rp54.000 · lunas')
  })

  it('stays linear on a long hostile string', () => {
    const input = '<'.repeat(200_000)
    const started = performance.now()
    expect(escapeHtml(input)).toHaveLength(800_000)
    expect(performance.now() - started).toBeLessThan(500)
  })
})

describe('html tag', () => {
  it('escapes interpolated values', () => {
    const name = '<img src=x onerror=alert(1)>'
    expect(html`<div>${name}</div>`.value).toBe('<div>&lt;img src=x onerror=alert(1)&gt;</div>')
  })

  it('escapes a value placed inside an attribute', () => {
    expect(html`<a title="${'" onclick="x'}">k</a>`.value).toBe('<a title="&quot; onclick=&quot;x">k</a>')
  })

  it('passes nested html results through without double escaping', () => {
    const item = html`<li>${'a&b'}</li>`
    expect(html`<ul>${item}</ul>`.value).toBe('<ul><li>a&amp;b</li></ul>')
  })

  it('joins arrays of values and nested results', () => {
    const rows = ['<1>', '2'].map((n) => html`<td>${n}</td>`)
    expect(html`<tr>${rows}</tr>`.value).toBe('<tr><td>&lt;1&gt;</td><td>2</td></tr>')
  })

  it('renders null, undefined and false as nothing but keeps 0', () => {
    expect(html`${null}${undefined}${false}${0}`.value).toBe('0')
  })

  it('inserts rawHtml verbatim', () => {
    expect(html`<p>${rawHtml('<b>ok</b>')}</p>`.value).toBe('<p><b>ok</b></p>')
  })

  it('returns SafeHtml that stringifies to its markup', () => {
    const out = html`<p>x</p>`
    expect(out).toBeInstanceOf(SafeHtml)
    expect(String(out)).toBe('<p>x</p>')
  })
})

describe('htmlJson', () => {
  it('cannot close the surrounding script tag', () => {
    const out = html`<script>var d=${htmlJson({ note: '</script><script>alert(1)</script>' })}</script>`.value
    expect(out.match(/<\/script>/g)).toHaveLength(1)
    expect(out).toContain('\\u003c/script\\u003e')
  })

  it('round-trips through JSON.parse', () => {
    const value = { a: '<&>', b: [1, 2], c: 'line\u2028sep' }
    expect(JSON.parse(htmlJson(value).value)).toEqual(value)
  })

  it('serialises undefined as null', () => {
    expect(htmlJson(undefined).value).toBe('null')
  })
})
