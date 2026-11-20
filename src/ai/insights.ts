import { useEffect } from 'react'

/**
 * AI Insights: what the screen holds, for the AI button.
 * - Every list (Paged, the Leads list) registers its full filtered rows here, not only the page on screen.
 * - At open, the page's text and those rows are turned into plain text, with people's names swapped for "Person N" and
 *   phone numbers / emails removed; the answer's "Person N" is turned back into the name in the browser.
 */
const lists = new Map<symbol, unknown[]>()

/** a list's full rows (all pages), for AI Insights */
export function useAiRows(rows: unknown[]) {
  useEffect(() => {
    const k = Symbol('list')
    lists.set(k, rows)
    return () => {
      lists.delete(k)
    }
  }, [rows])
}

const names = new Map<symbol, string[]>()
/** people's names a screen shows outside its lists (e.g. the lead on the lead page), to hide them too */
export function useAiNames(list: (string | null | undefined)[]) {
  const key = list.join('|')
  useEffect(() => {
    const k = Symbol('names')
    names.set(k, key.split('|').filter(Boolean))
    return () => {
      names.delete(k)
    }
  }, [key])
}

// ---------- hiding names, phone numbers and emails ----------
const PERSON_KEY = /^(name|full_name|lead_name|to_name|customer_name|contact_name|guest_name|client_name|member_name|owner_name|host_name|display_name|first_name|last_name|assigned_to_name|caller_name)$/
/** objects whose `name` is not a person */
const THING = /^(business|businesses|funnel|category|stage|source|studio|company|template|objective|workflow|team|role|product|plan|sub|form|campaign|ad|adset|ad_set|account|group|webinar|event|invoice|course|package|service|tag|status|type|kind)$/
const CONTACT_KEY = /phone|mobile|whatsapp|email|contact_no|alt_no|^to$|^from$/i
const SKIP_KEY = /^(id|tenant_id|created_by|updated_by|raw|config|permissions|password|token|secret|avatar_url|photo_url|logo_url|hx_queue_id|hx_call_id|webhook_secret)$|_id$|_ids$|url$|token$/i

export class Masker {
  private toAlias = new Map<string, string>()
  private toName = new Map<string, string>()
  private re: RegExp | null = null
  private reFor = -1
  /** "Person N" for a person's name (the same name keeps the same N) */
  alias(name: string) {
    const n = name.trim()
    if (n.length < 2) return n
    let a = this.toAlias.get(n)
    if (!a) {
      a = `Person ${this.toAlias.size + 1}`
      this.toAlias.set(n, a)
      this.toName.set(a, n)
    }
    return a
  }
  /** another spelling of an aliased name (e.g. the first name alone) */
  link(name: string, alias: string) {
    const n = name.trim()
    if (n.length >= 3 && !this.toAlias.has(n)) this.toAlias.set(n, alias)
  }
  /** a text with the known names swapped and phone numbers / emails removed */
  text(t: string) {
    let s = t
    if (this.reFor !== this.toAlias.size) {
      // one pattern for every known name (longest first), rebuilt when names are added
      const names = [...this.toAlias.keys()].filter((n) => n.length >= 3).sort((a, b) => b.length - a.length)
      this.re = names.length ? new RegExp(`(?<![\\p{L}\\d])(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\d])`, 'gu') : null
      this.reFor = this.toAlias.size
    }
    if (this.re) s = s.replace(this.re, (n) => this.toAlias.get(n) ?? n)
    s = s.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    s = s.replace(/\+?\d[\d -]{8,15}\d/g, (m) => {
      const digits = m.replace(/\D/g, '')
      if (/^\d{4}-\d{2}-\d{2}/.test(m) || digits.length < 10 || digits.length > 13) return m
      return '[phone]'
    })
    return s
  }
  /** the answer with the names back */
  restore(t: string) {
    return t.replace(/Person (\d+)/g, (m) => this.toName.get(m) ?? m)
  }
}

type Cell = string | number | boolean
function flat(row: unknown, m: Masker): Record<string, Cell> {
  const out: Record<string, Cell> = {}
  if (!row || typeof row !== 'object') return { value: String(row) }
  const r = row as Record<string, unknown>
  const isPerson = Object.keys(r).some((k) => CONTACT_KEY.test(k))
  // first + last name (leads): one person, one alias; the first name alone maps to it too
  if (typeof r.first_name === 'string' && r.first_name.trim()) {
    const first = r.first_name.trim()
    const full = [first, typeof r.last_name === 'string' ? r.last_name.trim() : ''].filter(Boolean).join(' ')
    const a = m.alias(full)
    m.link(first, a)
    out.name = a
  }
  const put = (key: string, leaf: string, v: unknown, person: boolean) => {
    if (v === null || v === undefined || v === '') return
    if (SKIP_KEY.test(leaf) || CONTACT_KEY.test(leaf)) return
    if (typeof v === 'string') {
      const personName = PERSON_KEY.test(leaf) && (leaf !== 'name' || person)
      out[key] = personName ? m.alias(v) : v.length > 240 ? `${v.slice(0, 240)}…` : v
    } else if (typeof v === 'number' || typeof v === 'boolean') out[key] = v
  }
  for (const [k, v] of Object.entries(r)) {
    if (SKIP_KEY.test(k) || CONTACT_KEY.test(k) || k === 'first_name' || k === 'last_name') continue
    if (Array.isArray(v)) {
      if (v.every((x) => typeof x !== 'object')) {
        if (v.length) out[k] = v.slice(0, 8).join(', ')
      } else out[`${k}_count`] = v.length
    } else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      const person = !THING.test(k) && Object.keys(o).some((x) => CONTACT_KEY.test(x) || PERSON_KEY.test(x))
      for (const [k2, v2] of Object.entries(o)) {
        if (v2 && typeof v2 === 'object') continue
        put(`${k}.${k2}`, k2, v2, person || (k2 === 'name' && !THING.test(k)))
      }
    } else put(k, k, v, isPerson)
  }
  return out
}

const cell = (v: Cell | undefined) => (v === undefined ? '' : String(v).replace(/[\t\n\r]+/g, ' '))

/** the screen as text for the AI: the page's text, then every list's rows (tab-separated), within `budget` characters */
export function snapshot(m: Masker, budget = 300_000) {
  for (const list of names.values()) for (const n of list) m.link(n.split(' ')[0], m.alias(n))
  const all = [...lists.values()].filter((r) => r.length)
  // the rows first (they give names to swap in the page's text)
  const tables = all.map((rows) => rows.map((r) => flat(r, m)))
  const page = document.querySelector('main.page') as HTMLElement | null
  const drawers = [...document.querySelectorAll('.drawer')] as HTMLElement[]
  let text = m.text([page?.innerText ?? '', ...drawers.map((d) => `[Open panel]\n${d.innerText}`)].join('\n\n')).replace(/\n{3,}/g, '\n\n')
  if (text.length > 40_000) text = `${text.slice(0, 40_000)}\n…`
  let left = budget - text.length
  let sampled = false
  const parts = tables.map((rows, i) => {
    const cols = [...new Set(rows.slice(0, 200).flatMap((r) => Object.keys(r)))]
    const head = cols.join('\t')
    const lines: string[] = []
    let used = head.length
    for (const r of rows) {
      const line = m.text(cols.map((c) => cell(r[c])).join('\t'))
      if (used + line.length + 1 > Math.max(2000, left / (tables.length - i))) {
        sampled = true
        break
      }
      lines.push(line)
      used += line.length + 1
    }
    left -= used
    const note = lines.length < rows.length ? ` — a sample: the first ${lines.length} of ${rows.length} rows` : ''
    return `LIST ${i + 1} (${rows.length} rows${note}):\n${head}\n${lines.join('\n')}`
  })
  const lists_ = parts.length ? `\n\nFULL DATA OF THE LISTS ON THIS SCREEN (all rows, not only the page shown):\n\n${parts.join('\n\n')}` : ''
  return { context: `SCREEN TEXT:\n${text}${lists_}`, sampled, rows: tables.reduce((t, r) => t + r.length, 0) }
}
