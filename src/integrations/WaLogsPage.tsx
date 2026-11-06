import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowLeft, Check, CheckCheck, Copy, MessageCircle, RefreshCw, Send, X } from 'lucide-react'
import { Hint, Label, TextInput } from '@/components/Field'
import { SearchSelect } from '@/components/SearchSelect'
import { Empty, PageHead, Paged, SearchInput } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { templateOptions, useWatiTemplates, watiVars } from '@/workflows/WhatsAppFields'
import { at, leadName, listChat, listWaLogs, nicePhone, sendWaTemplate, STATUS_META, waHook, waHookUrl, type WaLog, type WaLogStatus } from './waLogs'

const day = (d: Date) => d.toLocaleDateString('en-CA')
const ago = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return day(d)
}
const short = (iso: string) => {
  const d = new Date(iso)
  return day(d) === day(new Date()) ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/** System Connections → WhatsApp → Logs: every message sent (and replies), and a chat window per number. */
export function WaLogsPage() {
  const tenant = useTenant()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'chats' ? 'chats' : 'logs'
  const [from, setFrom] = useState(ago(30))
  const [to, setTo] = useState(day(new Date()))
  const [rows, setRows] = useState<WaLog[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hook, setHook] = useState<{ key: string; last_event_at: string | null } | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(() => {
    setError(null)
    listWaLogs(tenant.id, from, to).then(setRows, (e: Error) => setError(e.message))
  }, [tenant.id, from, to])
  useEffect(load, [load])
  useEffect(() => {
    void waHook(tenant.id).then(setHook, () => setHook(null))
  }, [tenant.id])

  const go = (t: 'logs' | 'chats', phone?: string) => setParams(t === 'logs' ? {} : { tab: 'chats', ...(phone ? { phone } : {}) }, { replace: true })

  return (
    <>
      <PageHead
        title="WhatsApp logs"
        subtitle="Every message sent from BizDock (workflows and here), with delivered and read times, and the replies."
        actions={
          <Link to="/integrations" className="btn btn-outline">
            <ArrowLeft size={16} /> System Connections
          </Link>
        }
      />
      {hook && (
        <div className="card card-pad stack" style={{ gap: 6, marginBottom: 14 }}>
          <span className="field-label">WATI webhook (for delivered / read times and replies)</span>
          <div className="hook-url">
            <code>{waHookUrl(hook.key)}</code>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                void navigator.clipboard.writeText(waHookUrl(hook.key))
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1500)
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <Hint>
            In WATI → Webhooks, add this URL once and tick the message events (message received, template message sent, delivered, read, failed).{' '}
            {hook.last_event_at ? `Last event from WATI: ${at(hook.last_event_at)}.` : 'Nothing received from WATI yet.'}
          </Hint>
        </div>
      )}
      <div className="tabs" role="tablist" style={{ marginBottom: 12 }}>
        <button type="button" role="tab" className={cn('tab', tab === 'logs' && 'is-active')} onClick={() => go('logs')}>
          Message logs
        </button>
        <button type="button" role="tab" className={cn('tab', tab === 'chats' && 'is-active')} onClick={() => go('chats')}>
          Chats
        </button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {tab === 'logs' ? (
        <LogsTab rows={rows} from={from} to={to} setFrom={setFrom} setTo={setTo} reload={load} openChat={(p) => go('chats', p)} />
      ) : (
        <ChatsTab rows={rows} phone={params.get('phone')} pick={(p) => go('chats', p)} reload={load} />
      )}
    </>
  )
}

function LogsTab({
  rows,
  from,
  to,
  setFrom,
  setTo,
  reload,
  openChat,
}: {
  rows: WaLog[] | null
  from: string
  to: string
  setFrom: (v: string) => void
  setTo: (v: string) => void
  reload: () => void
  openChat: (phone: string) => void
}) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'' | WaLogStatus>('')
  const [source, setSource] = useState('')
  const [template, setTemplate] = useState('')
  const templates = useMemo(() => [...new Set((rows ?? []).map((r) => r.template).filter(Boolean) as string[])].sort(), [rows])
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    const digits = s.replace(/\D/g, '')
    return (rows ?? []).filter(
      (r) =>
        (!status || r.status === status) &&
        (!source || r.source === source) &&
        (!template || r.template === template) &&
        (!s || `${leadName(r)} ${r.template ?? ''} ${r.body ?? ''} ${r.workflows?.name ?? ''}`.toLowerCase().includes(s) || (digits.length >= 3 && r.phone.includes(digits))),
    )
  }, [rows, q, status, source, template])
  const count = (st: WaLogStatus) => (rows ?? []).filter((r) => r.status === st).length

  return (
    <section className="panel">
      <div className="panel-filters">
        <SearchInput placeholder="Name, number or template" value={q} onChange={setQ} width={240} />
        <select className="input input-sm filter-select" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as '' | WaLogStatus)}>
          <option value="">All statuses</option>
          {(Object.keys(STATUS_META) as WaLogStatus[]).map((k) => (
            <option key={k} value={k}>
              {STATUS_META[k].label} ({count(k)})
            </option>
          ))}
        </select>
        <select className="input input-sm filter-select" aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All sources</option>
          <option value="workflow">Workflows</option>
          <option value="app">Sent here</option>
          <option value="reply">Replies</option>
        </select>
        <select className="input input-sm filter-select" aria-label="Template" value={template} onChange={(e) => setTemplate(e.target.value)}>
          <option value="">All templates</option>
          {templates.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input className="input input-sm filter-select" aria-label="From date" title="From date" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        <input className="input input-sm filter-select" aria-label="To date" title="To date" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        {(q || status || source || template) && (
          <button
            type="button"
            className="clear-btn"
            onClick={() => {
              setQ('')
              setStatus('')
              setSource('')
              setTemplate('')
            }}
          >
            Reset
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={reload} title="Refresh" aria-label="Refresh" style={{ marginLeft: 'auto' }}>
          <RefreshCw size={14} />
        </button>
      </div>
      {!rows ? (
        <div className="empty">Loading…</div>
      ) : !shown.length ? (
        <Empty icon={MessageCircle}>No messages for these filters.</Empty>
      ) : (
        <Paged rows={shown}>
          {(paged) => (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Sent on</th>
                    <th>Contact</th>
                    <th>Message</th>
                    <th>From</th>
                    <th>Status</th>
                    <th>Delivered</th>
                    <th>Read</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((r) => (
                    <tr key={r.id} className="is-clickable" onClick={() => openChat(r.phone)} title="Open the chat">
                      <td className="nowrap">{at(r.sent_at)}</td>
                      <td>
                        <b>{leadName(r) || nicePhone(r.phone)}</b>
                        {leadName(r) && <div className="muted small">{nicePhone(r.phone)}</div>}
                      </td>
                      <td style={{ maxWidth: 340 }}>
                        {r.template && <code>{r.template}</code>}
                        {r.body && <div className="muted small wa-log-body">{r.body}</div>}
                      </td>
                      <td className="small">{r.source === 'workflow' ? r.workflows?.name ?? 'Workflow' : r.source === 'reply' ? 'Reply' : 'Sent here'}</td>
                      <td>
                        <span className={cn('badge', STATUS_META[r.status].cls)} title={r.error ?? undefined}>
                          {STATUS_META[r.status].label}
                        </span>
                        {r.error && <div className="small danger-text wa-log-body">{r.error}</div>}
                      </td>
                      <td className="nowrap small">{at(r.delivered_at) || <span className="muted">—</span>}</td>
                      <td className="nowrap small">{at(r.read_at) || <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Paged>
      )}
    </section>
  )
}

function ChatsTab({ rows, phone, pick, reload }: { rows: WaLog[] | null; phone: string | null; pick: (p: string) => void; reload: () => void }) {
  const tenant = useTenant()
  const [q, setQ] = useState('')
  // one row per number, newest first
  const chats = useMemo(() => {
    const m = new Map<string, { phone: string; name: string; last: WaLog; replies: number }>()
    for (const r of rows ?? []) {
      const c = m.get(r.phone)
      if (!c) m.set(r.phone, { phone: r.phone, name: leadName(r), last: r, replies: r.direction === 'in' ? 1 : 0 })
      else {
        if (!c.name && leadName(r)) c.name = leadName(r)
        if (r.direction === 'in') c.replies++
      }
    }
    const s = q.trim().toLowerCase()
    return [...m.values()].filter((c) => !s || c.name.toLowerCase().includes(s) || c.phone.includes(s.replace(/\D/g, '') || '~'))
  }, [rows, q])
  const active = phone ?? chats[0]?.phone ?? null

  return (
    <div className="wa-chats">
      <aside className="wa-chat-list">
        <div style={{ padding: 10 }}>
          <SearchInput placeholder="Search chats" value={q} onChange={setQ} />
        </div>
        {!rows ? (
          <div className="muted small" style={{ padding: 12 }}>
            Loading…
          </div>
        ) : !chats.length ? (
          <div className="muted small" style={{ padding: 12 }}>
            No chats in these dates.
          </div>
        ) : (
          chats.map((c) => (
            <button key={c.phone} type="button" className={cn('wa-chat-item', c.phone === active && 'is-active')} onClick={() => pick(c.phone)}>
              <span className="wa-avatar">{(c.name || '#').slice(0, 1).toUpperCase()}</span>
              <span className="wa-chat-main">
                <span className="wa-chat-top">
                  <b>{c.name || nicePhone(c.phone)}</b>
                  <small className="muted">{short(c.last.sent_at)}</small>
                </span>
                <span className="muted small wa-log-body">
                  {c.last.direction === 'in' ? '↩ ' : ''}
                  {c.last.body || c.last.template || ''}
                </span>
              </span>
            </button>
          ))
        )}
      </aside>
      <section className="wa-chat-pane">
        {active ? <Conversation key={active} tenantId={tenant.id} phone={active} onSent={reload} /> : <Empty icon={MessageCircle}>Pick a chat.</Empty>}
      </section>
    </div>
  )
}

function Conversation({ tenantId, phone, onSent }: { tenantId: string; phone: string; onSent: () => void }) {
  const [msgs, setMsgs] = useState<WaLog[] | null>(null)
  const { list, error: tplError } = useWatiTemplates()
  const [pickedKey, setPickedKey] = useState<string | null>(null)
  const [vals, setVals] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    listChat(tenantId, phone).then(setMsgs, (e: Error) => setError(e.message))
  }, [tenantId, phone])
  useEffect(load, [load])
  // (newer browsers return a promise from scrollIntoView: an effect must not return it)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [msgs])

  const name = msgs?.map(leadName).find(Boolean) ?? ''
  const leadId = msgs?.map((m) => m.lead_id).filter(Boolean).at(-1) ?? null
  const approved = useMemo(() => (list ?? []).filter((t) => (t.status ?? '').toUpperCase() === 'APPROVED'), [list])
  const picked = approved.find((t) => `${t.elementName}|${t.language?.value ?? ''}` === pickedKey) ?? null
  const vars = picked ? watiVars(picked).vars : []
  const body = picked ? picked.bodyOriginal || picked.body || '' : ''

  async function send() {
    if (!picked) return
    setBusy(true)
    setError(null)
    try {
      await sendWaTemplate(tenantId, { phone, template: picked.elementName, params: Object.fromEntries(vars.map((v) => [v, vals[v] ?? ''])), body, lead_id: leadId })
      setPickedKey(null)
      setVals({})
      load()
      onSent()
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }

  return (
    <>
      <header className="wa-chat-head">
        <span className="wa-avatar">{(name || '#').slice(0, 1).toUpperCase()}</span>
        <div>
          <b>{name || nicePhone(phone)}</b>
          <div className="muted small">{nicePhone(phone)}</div>
        </div>
        {leadId && (
          <Link to={`/leads/${leadId}`} className="btn btn-outline btn-sm" style={{ marginLeft: 'auto' }}>
            Open lead
          </Link>
        )}
      </header>
      <div className="wa-chat-body">
        {!msgs ? (
          <div className="muted small">Loading…</div>
        ) : (
          msgs.map((m) => (
            <div key={m.id} className={cn('wa-msg', m.direction === 'in' ? 'is-in' : 'is-out', m.status === 'failed' && 'is-failed')}>
              {m.template && m.direction === 'out' && <div className="wa-msg-tpl">{m.template}</div>}
              <div className="wa-msg-text">{m.body || (m.template ? '' : '—')}</div>
              <div className="wa-msg-meta">
                {at(m.sent_at)}
                {m.direction === 'out' &&
                  (m.status === 'read' ? (
                    <CheckCheck size={14} className="is-read" aria-label="Read" />
                  ) : m.status === 'delivered' ? (
                    <CheckCheck size={14} aria-label="Delivered" />
                  ) : m.status === 'failed' ? (
                    <X size={14} aria-label="Failed" />
                  ) : (
                    <Check size={14} aria-label="Sent" />
                  ))}
              </div>
              {m.direction === 'out' && (m.read_at || m.delivered_at) && (
                <div className="wa-msg-meta">{m.read_at ? `Read ${at(m.read_at)}` : `Delivered ${at(m.delivered_at)}`}</div>
              )}
              {m.error && <div className="wa-msg-meta danger-text">{m.error}</div>}
            </div>
          ))
        )}
        <div ref={end} />
      </div>
      <footer className="wa-chat-foot">
        {error && <div className="alert alert-error small">{error}</div>}
        {tplError && <div className="alert alert-error small">{tplError}</div>}
        <div className="stack" style={{ gap: 8 }}>
          <Label htmlFor="wa-tpl">Send a template</Label>
          <SearchSelect
            id="wa-tpl"
            value={pickedKey}
            onChange={(v) => {
              setPickedKey(v || null)
              setVals({})
            }}
            options={templateOptions(approved, null, '— pick an approved template —')}
            placeholder="Pick an approved template"
          />
          {picked && (
            <>
              {body && <div className="muted small wa-tpl-preview">{body}</div>}
              {vars.length > 0 && (
                <div className="form-grid">
                  {vars.map((v) => (
                    <div key={v}>
                      <Label htmlFor={`wa-v-${v}`}>{`{{${v}}}`}</Label>
                      <TextInput id={`wa-v-${v}`} value={vals[v] ?? ''} onChange={(e) => setVals((x) => ({ ...x, [v]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              )}
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-primary" disabled={busy || vars.some((v) => !(vals[v] ?? '').trim())} onClick={() => void send()}>
                  <Send size={15} /> {busy ? 'Sending…' : 'Send'}
                </button>
              </div>
            </>
          )}
          <Hint>WhatsApp only allows approved templates until the person writes back.</Hint>
        </div>
      </footer>
    </>
  )
}
