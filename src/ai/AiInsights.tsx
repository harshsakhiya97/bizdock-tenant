import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { RotateCcw, Send, Sparkles, X } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { listMemberOptions } from '@/leads/api'
import { db } from '@/lib/supabase'
import { useTenant } from '@/tenant/useTenant'
import { Masker, snapshot } from './insights'

type Msg = { role: 'user' | 'model'; text: string; shown: string }

const SUMMARY = 'Give me a short summary of this screen: what it shows, the key numbers, what stands out, what needs attention, and 2–3 next steps.'
const QUICK = ['What needs attention?', 'Who or what is doing best?', 'Any risks or drops?', 'What should I do next?']

async function ask(body: Record<string, unknown>) {
  const { data, error } = await db().functions.invoke('gemini', { body })
  if (data?.error) throw new Error(String(data.error))
  if (error) {
    const ctx = (error as { context?: unknown }).context
    const p = ctx && typeof (ctx as Response).json === 'function' ? await (ctx as Response).json().catch(() => null) : null
    throw new Error(p?.error ? String(p.error) : error.name === 'FunctionsFetchError' ? 'AI Insights isn’t reachable right now. Try again in a minute.' : error.message)
  }
  return data as { text: string }
}

/** **bold** and *italic* inside a line */
function inline(t: string): ReactNode[] {
  return t.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p.length > 2 && p.startsWith('*') && p.endsWith('*') ? <i key={i}>{p.slice(1, -1)}</i> : <Fragment key={i}>{p}</Fragment>,
  )
}
/** a small Markdown subset: headings, bullet / numbered lists, paragraphs */
export function Md({ text }: { text: string }) {
  const out: ReactNode[] = []
  let list: { ordered: boolean; items: ReactNode[] } | null = null
  const flush = () => {
    if (!list) return
    const L = list.ordered ? 'ol' : 'ul'
    out.push(<L key={out.length}>{list.items}</L>)
    list = null
  }
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line)
    const num = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (bullet || num) {
      const ordered = !!num && !bullet
      if (!list || list.ordered !== ordered) {
        flush()
        list = { ordered, items: [] }
      }
      list.items.push(<li key={list.items.length}>{inline((bullet ?? num)![1])}</li>)
      continue
    }
    flush()
    if (!line.trim()) continue
    const h = /^#{1,6}\s+(.*)$/.exec(line)
    out.push(h ? <b key={out.length} className="ai-h">{inline(h[1])}</b> : <p key={out.length}>{inline(line)}</p>)
  }
  flush()
  return <div className="ai-md">{out}</div>
}

/** AI Insights: the AI button on every page; opens a chat that starts with a summary of the screen (a fresh chat each time) */
export function AiInsights({ page }: { page: string }) {
  const tenant = useTenant()
  const { can } = useAuth()
  const { pathname } = useLocation()
  const allowed = can('ai_insights', 'view')
  const [status, setStatus] = useState<{ connected: boolean } | null>(null)
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [note, setNote] = useState('')
  const ctx = useRef<{ context: string; page: string; masker: Masker } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!allowed) return
    void ask({ action: 'insights_status', tenant_id: tenant.id }).then(
      (d) => setStatus(d as unknown as { connected: boolean }),
      () => setStatus(null),
    )
  }, [allowed, tenant.id])
  // a new page: a fresh chat
  useEffect(() => {
    setOpen(false)
  }, [pathname])
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, busy])

  async function send(history: Msg[]) {
    const c = ctx.current
    if (!c) return
    setMsgs(history)
    setBusy(true)
    setError(null)
    try {
      const d = await ask({ action: 'insights', tenant_id: tenant.id, page: c.page, context: c.context, messages: history.map((m) => ({ role: m.role, text: m.text })) })
      setMsgs([...history, { role: 'model', text: d.text, shown: c.masker.restore(d.text) }])
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }

  async function start() {
    setOpen(true)
    setMsgs([])
    setError(null)
    setInput('')
    const m = new Masker()
    // the team's names are hidden too
    try {
      for (const x of await listMemberOptions(tenant.id)) if (x.name) m.link(x.name.split(' ')[0], m.alias(x.name))
    } catch {
      /* names in lists are still hidden */
    }
    const s = snapshot(m)
    ctx.current = { context: s.context, page: page, masker: m }
    setNote(s.rows ? `Read this screen and ${s.rows.toLocaleString('en-IN')} row${s.rows === 1 ? '' : 's'} of its lists${s.sampled ? ' (a sample of the biggest lists)' : ''}. Names, phone numbers and emails are hidden from the AI.` : 'Read this screen. Names, phone numbers and emails are hidden from the AI.')
    void send([{ role: 'user', text: SUMMARY, shown: 'Summary of this screen' }])
  }

  if (!allowed || !status?.connected) return null
  const askText = (t: string) => {
    const q = t.trim()
    if (!q || busy || !ctx.current) return
    setInput('')
    void send([...msgs, { role: 'user', text: ctx.current.masker.text(q), shown: q }])
  }
  return (
    <>
      {open && (
        <section className="ai-panel" role="dialog" aria-label="AI Insights">
          <header className="ai-head">
            <span className="ai-badge">
              <Sparkles size={15} />
            </span>
            <div className="ai-title">
              <b>AI Insights</b>
              <small className="muted">{page}</small>
            </div>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" title="Read the screen again (new chat)" onClick={() => void start()} disabled={busy}>
              <RotateCcw size={15} />
            </button>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" title="Close" onClick={() => setOpen(false)}>
              <X size={16} />
            </button>
          </header>
          <div className="ai-body" ref={listRef}>
            {note && <div className="ai-note">{note}</div>}
            {msgs.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="ai-msg ai-me">
                  {m.shown}
                </div>
              ) : (
                <div key={i} className="ai-msg ai-bot">
                  <Md text={m.shown} />
                </div>
              ),
            )}
            {busy && (
              <div className="ai-msg ai-bot ai-typing" aria-label="Thinking">
                <span />
                <span />
                <span />
              </div>
            )}
            {error && <div className="alert alert-error small">{error}</div>}
            {!busy && msgs.length > 1 && msgs.length < 4 && (
              <div className="ai-quick">
                {QUICK.map((q) => (
                  <button key={q} type="button" className="chip" onClick={() => askText(q)}>
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
          <form
            className="ai-input"
            onSubmit={(e) => {
              e.preventDefault()
              askText(input)
            }}
          >
            <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about this screen…" aria-label="Ask about this screen" />
            <button type="submit" className="btn btn-primary btn-icon" disabled={busy || !input.trim()} aria-label="Send">
              <Send size={15} />
            </button>
          </form>
        </section>
      )}
      <button type="button" className={`ai-fab${open ? ' is-open' : ''}`} title="AI Insights: summary of this screen" aria-label="AI Insights" onClick={() => (open ? setOpen(false) : void start())}>
        {open ? <X size={22} /> : <Sparkles size={22} />}
      </button>
    </>
  )
}
