import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Check, CheckCheck, MessageCircle, RefreshCw, Send, X } from 'lucide-react'
import { Hint, Label, TextInput, Select } from '@/components/Field'
import { SearchSelect } from '@/components/SearchSelect'
import { Empty, PageHead, Paged, SearchInput } from '@/components/ui'
import { cn } from '@/lib/cn'
import { DateRangePicker, type Range } from '@/components/DateRange'
import { useTenant } from '@/tenant/useTenant'
import { templateOptions, useWatiTemplates, watiVars } from '@/workflows/WhatsAppFields'
import { at, leadName, listChat, listWaChats, listWaLogs, nicePhone, sendWaTemplate, STATUS_META, type WaChat, type WaLog, type WaLogStatus } from './waLogs'

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

/** WhatsApp → History logs (every message sent, and the replies) / Individual chat (a chat window per number). */
export function WaLogsPage({ view }: { view: 'logs' | 'chats' }) {
  const tenant = useTenant()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [range, setRange] = useState<Range>(() => ({ key: 'custom', from: ago(view === 'chats' ? 90 : 30), to: day(new Date()) }))
  const { from, to } = range
  const [rows, setRows] = useState<WaLog[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    // Individual chat loads its own list (20 at a time)
    if (view === 'chats') return
    listWaLogs(tenant.id, from, to).then(setRows, (e: Error) => setError(e.message))
  }, [tenant.id, from, to, view])
  useEffect(load, [load])

  return (
    <>
      <PageHead
        title={view === 'chats' ? 'Individual chat' : 'History logs'}
        subtitle={
          view === 'chats'
            ? 'A conversation per number (last 90 days), and send an approved template.'
            : 'Every message sent from BizDock (workflows, campaigns and chats), with delivered and read times, and the replies.'
        }
      />
      {error && <div className="alert alert-error">{error}</div>}
      {view === 'logs' ? (
        <LogsTab rows={rows} range={range} setRange={setRange} reload={load} openChat={(p) => navigate(`/whatsapp/chats?phone=${p}`)} />
      ) : (
        <ChatsTab from={from} to={to} phone={params.get('phone')} pick={(p) => setParams({ phone: p }, { replace: true })} />
      )}
    </>
  )
}

function LogsTab({
  rows,
  range,
  setRange,
  reload,
  openChat,
}: {
  rows: WaLog[] | null
  range: Range
  setRange: (r: Range) => void
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
        <Select className="input input-sm filter-select" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as '' | WaLogStatus)}>
          <option value="">All statuses</option>
          {(Object.keys(STATUS_META) as WaLogStatus[]).map((k) => (
            <option key={k} value={k}>
              {STATUS_META[k].label} ({count(k)})
            </option>
          ))}
        </Select>
        <Select className="input input-sm filter-select" aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All sources</option>
          <option value="workflow">Workflows</option>
          <option value="campaign">Campaigns</option>
          <option value="app">Chats</option>
          <option value="reply">Replies</option>
        </Select>
        <Select className="input input-sm filter-select" aria-label="Template" value={template} onChange={(e) => setTemplate(e.target.value)}>
          <option value="">All templates</option>
          {templates.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <DateRangePicker value={range} onChange={setRange} />
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
                      <td className="small">{r.source === 'workflow' ? r.workflows?.name ?? 'Workflow' : r.source === 'reply' ? 'Reply' : r.source === 'campaign' ? (r.wa_campaigns?.name ? `Campaign · ${r.wa_campaigns.name}` : 'Campaign') : 'Chat'}</td>
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

const CHAT_PAGE = 20

/** Individual chat: the numbers 20 at a time (Show more); search asks the server, then 20 at a time too */
function ChatsTab({ from, to, phone, pick }: { from: string; to: string; phone: string | null; pick: (p: string) => void }) {
  const tenant = useTenant()
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [chats, setChats] = useState<WaChat[] | null>(null)
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // search after a short pause in typing
  useEffect(() => {
    const t = window.setTimeout(() => setTerm(q.trim()), 300)
    return () => window.clearTimeout(t)
  }, [q])
  const page = useCallback(
    (offset: number) => {
      setBusy(true)
      setError(null)
      // one extra row tells whether there are more
      return listWaChats(tenant.id, from, to, term, offset, CHAT_PAGE + 1)
        .then((r) => {
          setMore(r.length > CHAT_PAGE)
          const got = r.slice(0, CHAT_PAGE)
          setChats((c) => (offset === 0 ? got : [...(c ?? []), ...got]))
        })
        .catch((e: Error) => setError(e.message))
        .finally(() => setBusy(false))
    },
    [tenant.id, from, to, term],
  )
  useEffect(() => {
    setChats(null)
    void page(0)
  }, [page])
  const reload = () => void page(0)
  const active = phone ?? chats?.[0]?.phone ?? null

  return (
    <div className="wa-chats">
      <aside className="wa-chat-list">
        <div style={{ padding: 10 }}>
          <SearchInput placeholder="Search chats" value={q} onChange={setQ} />
        </div>
        {error && <div className="alert alert-error" style={{ margin: 10 }}>{error}</div>}
        {!chats ? (
          <div className="muted small" style={{ padding: 12 }}>
            Loading…
          </div>
        ) : !chats.length ? (
          <div className="muted small" style={{ padding: 12 }}>
            {term ? 'No chats match.' : 'No chats in these dates.'}
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
        {chats && more && (
          <div style={{ padding: 10 }}>
            <button type="button" className="btn btn-ghost btn-sm" style={{ width: '100%' }} disabled={busy} onClick={() => void page(chats.length)}>
              {busy ? 'Loading…' : 'Show more'}
            </button>
          </div>
        )}
      </aside>
      <section className="wa-chat-pane">
        {active ? <Conversation key={active} tenantId={tenant.id} phone={active} onSent={reload} /> : <Empty icon={MessageCircle}>Pick a chat.</Empty>}
      </section>
    </div>
  )
}

/** a message to show in the chat that isn't in WATI's log (e.g. sent from the lead page), as an outgoing bubble */
export type ChatExtra = { id: string; at: string; title: string | null; body: string; by: string | null }

/**
 * One WhatsApp chat (WATI): the messages as bubbles, then Send a template. On the lead page (Follow-ups → WhatsApp):
 * phones = the lead's number in both forms, leadId, hideHead, and extra = the lead's other WhatsApp messages.
 */
export function Conversation({
  tenantId,
  phone,
  onSent,
  phones,
  leadId: fixedLead,
  hideHead,
  extra,
}: {
  tenantId: string
  phone: string
  onSent: () => void
  phones?: string[]
  leadId?: string
  hideHead?: boolean
  extra?: ChatExtra[]
}) {
  const [logs, setMsgs] = useState<WaLog[] | null>(null)
  const { list, error: tplError } = useWatiTemplates()
  const [pickedKey, setPickedKey] = useState<string | null>(null)
  const [vals, setVals] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    listChat(tenantId, phones ?? phone).then(setMsgs, (e: Error) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, phone, (phones ?? []).join(',')])
  // WATI's messages and the extra ones, oldest first
  const msgs = useMemo(
    () =>
      logs &&
      [
        ...logs,
        ...(extra ?? []).map(
          (x) => ({ id: `x${x.id}`, direction: 'out', phone, lead_id: fixedLead ?? null, template: x.title, body: x.body, source: 'chat', workflow_id: null, status: 'sent', error: null, sent_at: x.at, delivered_at: null, read_at: null, by: x.by }) as unknown as WaLog & { by?: string | null },
        ),
      ].sort((a, b) => a.sent_at.localeCompare(b.sent_at)),
    [logs, extra, phone, fixedLead],
  )
  useEffect(load, [load])
  // (newer browsers return a promise from scrollIntoView: an effect must not return it)
  // to the newest message: the chat scrolls, not the page
  useEffect(() => {
    const box = end.current?.parentElement
    if (box) box.scrollTop = box.scrollHeight
  }, [msgs])

  const name = msgs?.map(leadName).find(Boolean) ?? ''
  const leadId = fixedLead ?? msgs?.map((m) => m.lead_id).filter(Boolean).at(-1) ?? null
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
      {!hideHead && (
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
      )}
      <div className="wa-chat-body">
        {!msgs ? (
          <div className="muted small">Loading…</div>
        ) : !msgs.length ? (
          <div className="muted small" style={{ margin: 'auto' }}>No WhatsApp messages yet.</div>
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
