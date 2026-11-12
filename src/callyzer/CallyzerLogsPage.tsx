import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowLeft, PhoneCall, RefreshCw } from 'lucide-react'
import { Empty, PageHead, Paged, SearchInput } from '@/components/ui'
import { db } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { at, nicePhone as waPhone } from '@/integrations/waLogs'

type CallLog = {
  id: string
  lead_id: string | null
  phone: string | null
  direction: string
  started_at: string
  duration_sec: number | null
  call_method: string | null
  emp_name: string | null
  agent_phone: string | null
  recording_url: string | null
  leads?: { first_name: string; last_name: string | null } | null
}

/** calls keep the 10-digit number */
const nicePhone = (p: string) => (p.length === 10 ? `+91 ${p.slice(0, 5)} ${p.slice(5)}` : p ? waPhone(p.replace(/\D/g, '')) : '—')
const day = (d: Date) => d.toLocaleDateString('en-CA')
const ago = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return day(d)
}
const secs = (n: number | null) => (!n ? '0s' : n >= 3600 ? `${Math.floor(n / 3600)}h ${Math.floor((n % 3600) / 60)}m` : n >= 60 ? `${Math.floor(n / 60)}m ${n % 60}s` : `${n}s`)
const DIR: Record<string, string> = { incoming: 'Incoming', outgoing: 'Outgoing', missed: 'Missed', rejected: 'Rejected', unknown: '—' }
const name = (r: CallLog) => (r.leads ? [r.leads.first_name, r.leads.last_name].filter(Boolean).join(' ') : '')
const by = (r: CallLog) => r.emp_name || (r.agent_phone ? nicePhone(r.agent_phone) : '')

/** System Connections → Callyzer → Logs: every call brought in from Callyzer (lead numbers only). */
export function CallyzerLogsPage() {
  const tenant = useTenant()
  const navigate = useNavigate()
  const [from, setFrom] = useState(ago(30))
  const [to, setTo] = useState(day(new Date()))
  const [rows, setRows] = useState<CallLog[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [method, setMethod] = useState('')
  const [dir, setDir] = useState('')
  const [status, setStatus] = useState('')
  const [emp, setEmp] = useState('')

  const load = useCallback(() => {
    setError(null)
    let qy = db()
      .from('calls')
      .select('id, lead_id, phone, direction, started_at, duration_sec, call_method, emp_name, agent_phone, recording_url, leads(first_name, last_name)')
      .eq('tenant_id', tenant.id)
      .eq('source', 'callyzer')
    if (from) qy = qy.gte('started_at', `${from}T00:00:00+05:30`)
    if (to) qy = qy.lte('started_at', `${to}T23:59:59+05:30`)
    qy.order('started_at', { ascending: false })
      .limit(5000)
      .then(({ data, error: e }) => (e ? setError(e.message) : setRows((data ?? []) as unknown as CallLog[])))
  }, [tenant.id, from, to])
  useEffect(load, [load])

  const emps = useMemo(() => [...new Set((rows ?? []).map(by).filter(Boolean))].sort(), [rows])
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    const digits = s.replace(/\D/g, '')
    return (rows ?? []).filter(
      (r) =>
        (!method || (method === 'wa' ? r.call_method === 'WhatsAppCall' : r.call_method !== 'WhatsAppCall')) &&
        (!dir || r.direction === dir) &&
        (!status || (status === 'yes' ? (r.duration_sec ?? 0) > 0 : !(r.duration_sec ?? 0))) &&
        (!emp || by(r) === emp) &&
        (!s || `${name(r)} ${by(r)}`.toLowerCase().includes(s) || (digits.length >= 3 && (r.phone ?? '').includes(digits))),
    )
  }, [rows, q, method, dir, status, emp])
  const n = (f: (r: CallLog) => boolean) => (rows ?? []).filter(f).length

  return (
    <>
      <PageHead
        title="Callyzer logs"
        subtitle="Every call brought in from Callyzer (calls to a lead’s number), with type, duration and recording."
        actions={
          <Link to="/integrations" className="btn btn-outline">
            <ArrowLeft size={16} /> System Connections
          </Link>
        }
      />
      {error && <div className="alert alert-error">{error}</div>}
      <section className="panel">
        <div className="panel-filters">
          <SearchInput placeholder="Name, number or caller" value={q} onChange={setQ} width={240} />
          <select className="input input-sm filter-select" aria-label="Call" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">All calls</option>
            <option value="normal">Normal calls ({n((r) => r.call_method !== 'WhatsAppCall')})</option>
            <option value="wa">WhatsApp calls ({n((r) => r.call_method === 'WhatsAppCall')})</option>
          </select>
          <select className="input input-sm filter-select" aria-label="Type" value={dir} onChange={(e) => setDir(e.target.value)}>
            <option value="">All types</option>
            {['incoming', 'outgoing', 'missed', 'rejected'].map((d) => (
              <option key={d} value={d}>
                {DIR[d]} ({n((r) => r.direction === d)})
              </option>
            ))}
          </select>
          <select className="input input-sm filter-select" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="yes">Connected ({n((r) => (r.duration_sec ?? 0) > 0)})</option>
            <option value="no">Not connected ({n((r) => !(r.duration_sec ?? 0))})</option>
          </select>
          <select className="input input-sm filter-select" aria-label="Caller" value={emp} onChange={(e) => setEmp(e.target.value)}>
            <option value="">All callers</option>
            {emps.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
          <input className="input input-sm filter-select" aria-label="From date" title="From date" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          <input className="input input-sm filter-select" aria-label="To date" title="To date" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          {(q || method || dir || status || emp) && (
            <button
              type="button"
              className="clear-btn"
              onClick={() => {
                setQ('')
                setMethod('')
                setDir('')
                setStatus('')
                setEmp('')
              }}
            >
              Reset
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={load} title="Refresh" aria-label="Refresh" style={{ marginLeft: 'auto' }}>
            <RefreshCw size={14} />
          </button>
        </div>
        {!rows ? (
          <div className="empty">Loading…</div>
        ) : !shown.length ? (
          <Empty icon={PhoneCall}>No calls for these filters.</Empty>
        ) : (
          <Paged rows={shown}>
            {(paged) => (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Called on</th>
                      <th>Contact</th>
                      <th>Call</th>
                      <th>Type</th>
                      <th>Duration</th>
                      <th>Status</th>
                      <th>By</th>
                      <th>Recording</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((r) => {
                      const ok = (r.duration_sec ?? 0) > 0
                      return (
                        <tr key={r.id} className={cn(r.lead_id && 'is-clickable')} onClick={() => r.lead_id && navigate(`/leads/${r.lead_id}`)} title={r.lead_id ? 'Open the lead' : undefined}>
                          <td className="nowrap">{at(r.started_at)}</td>
                          <td>
                            <b>{name(r) || nicePhone(r.phone ?? '')}</b>
                            {name(r) && <div className="muted small">{nicePhone(r.phone ?? '')}</div>}
                          </td>
                          <td className="nowrap">
                            {r.call_method === 'WhatsAppCall' ? <span className="badge badge-success">WhatsApp call</span> : <span className="badge badge-muted">Normal call</span>}
                          </td>
                          <td>{DIR[r.direction] ?? r.direction}</td>
                          <td className="num nowrap">{secs(r.duration_sec)}</td>
                          <td>
                            <span className={cn('badge', ok ? 'badge-success' : 'badge-muted')}>{ok ? 'Connected' : 'Not connected'}</span>
                          </td>
                          <td className="small nowrap">{by(r) || <span className="muted">—</span>}</td>
                          <td onClick={(e) => e.stopPropagation()}>
                            {r.recording_url ? (
                              <a href={r.recording_url} target="_blank" rel="noreferrer">
                                Play
                              </a>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Paged>
        )}
      </section>
    </>
  )
}
