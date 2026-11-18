import { useCallback, useEffect, useMemo, useState } from 'react'
import { PlayRecording } from './PlayRecording'
import { Link } from 'react-router'
import { Drawer } from '@/components/Drawer'
import { CheckCircle2, MicOff, PhoneOff, RefreshCw, TriangleAlert } from 'lucide-react'
import { DateRangePicker, presetRange, type Range } from '@/components/DateRange'
import { Empty, PageHead, Paged, StatCard } from '@/components/ui'
import { StatRecords, type StatShow } from '@/components/StatRecords'
import { cn } from '@/lib/cn'
import { db } from '@/lib/supabase'
import { useTenant } from '@/tenant/useTenant'

type Row = {
  emp_number: string
  emp_name: string | null
  total: number
  not_connected: number
  normal_connected: number
  whatsapp: number
  on_callyzer: number
  after_last_rec: number
  last_connected: string | null
  last_recording: string | null
}
type Health = 'active' | 'low' | 'none' | 'idle'
const HEALTH: Record<Health, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'badge-success' },
  low: { label: 'Low / Stalled', cls: 'badge-warning' },
  none: { label: 'No Recording', cls: 'badge-danger' },
  idle: { label: 'No connected calls', cls: 'badge-muted' },
}
/** Active: recordings arrive · Low / Stalled: under half of the normal connected calls recorded, or 3+ since the last
 *  recording · No Recording: connected calls but not one recording · No connected calls */
const healthOf = (r: Row): Health =>
  r.normal_connected === 0 ? 'idle' : r.on_callyzer === 0 ? 'none' : r.on_callyzer / r.normal_connected < 0.5 || r.after_last_rec >= 3 ? 'low' : 'active'

const at = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '—')
/** time from the last recording to now */
const gap = (iso: string | null) => {
  if (!iso) return 'Never'
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000))
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`
}

/** the picked days as times: from the first day's start to the day after the last */
const bounds = (r: Range) => {
  const from = new Date(`${r.from}T00:00:00`)
  const to = new Date(`${r.to}T00:00:00`)
  to.setDate(to.getDate() + 1)
  return { from: from.toISOString(), to: to.toISOString() }
}

/** Callyzer → Team numbers: per staff number, are recordings reaching Callyzer? (every call, not only to leads) */
export function CallyzerTeamPage() {
  const tenant = useTenant()
  const [range, setRange] = useState<Range>(() => presetRange('today'))
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [open, setOpen] = useState<Row | null>(null)
  const load = useCallback(() => {
    setError(null)
    const { from, to } = bounds(range)
    db()
      .rpc('callyzer_team_report', { p_tenant: tenant.id, p_from: from, p_to: to })
      .then(({ data, error: e }) => (e ? setError(e.message) : setRows((data ?? []) as Row[])))
  }, [tenant.id, range])
  useEffect(load, [load])

  const counts = useMemo(() => {
    const list = rows ?? []
    const of = (h: Health) => list.filter((r) => healthOf(r) === h).length
    return { active: of('active'), low: of('low'), none: of('none'), missing: list.reduce((n, r) => n + (r.normal_connected - r.on_callyzer), 0) }
  }, [rows])

  // a stat card's records: those staff numbers (click one for its calls)
  const [statShow, setStatShow] = useState<StatShow<Row> | null>(null)
  const showNums = (title: string, f: (r: Row) => boolean) => () =>
    setStatShow({
      title,
      rows: (rows ?? []).filter(f),
      cols: [
        {
          label: 'Staff number',
          render: (r) => (
            <>
              <b>{r.emp_name || r.emp_number}</b>
              {r.emp_name && <div className="muted small">{r.emp_number}</div>}
            </>
          ),
        },
        { label: 'Connected', num: true, render: (r) => r.normal_connected },
        { label: 'Recorded', num: true, render: (r) => r.on_callyzer },
        { label: 'Missing', num: true, render: (r) => Math.max(0, r.normal_connected - r.on_callyzer) || <span className="muted">0</span> },
        { label: 'Last recording', render: (r) => `${at(r.last_recording)} · ${gap(r.last_recording)} ago` },
        { label: 'Status', render: (r) => <span className={cn('badge', HEALTH[healthOf(r)].cls)}>{HEALTH[healthOf(r)].label}</span> },
      ],
    })
  return (
    <>
      <PageHead
        title="Team numbers"
        subtitle="Are recordings reaching Callyzer? Every call of each staff number (not only calls to leads)."
        actions={
          <>
            <DateRangePicker value={range} onChange={setRange} />
            <button type="button" className="btn btn-outline" onClick={load} title="Refresh">
              <RefreshCw size={15} />
            </button>
          </>
        }
      />
      {error && <div className="alert alert-error">{error}</div>}
      <div className="stat-grid">
        <StatCard icon={CheckCircle2} tone="success" value={counts.active} label="Recording active" hint="Arriving on Callyzer" onClick={showNums('Recording active', (r) => healthOf(r) === 'active')} />
        <StatCard icon={TriangleAlert} tone="warning" value={counts.low} label="Low / Stalled" hint="Under half recorded, or 3+ since the last one" onClick={showNums('Low / Stalled', (r) => healthOf(r) === 'low')} />
        <StatCard icon={MicOff} tone="danger" value={counts.none} label="No recording" hint="Nothing received on Callyzer" onClick={showNums('No recording', (r) => healthOf(r) === 'none')} />
        <StatCard icon={PhoneOff} tone="purple" value={counts.missing} label="Missing recordings" hint="Normal connected calls without a recording" onClick={showNums('Missing recordings', (r) => r.normal_connected - r.on_callyzer > 0)} />
      </div>
      <StatRecords show={statShow} onClose={() => setStatShow(null)} rowKey={(r) => r.emp_number} onRow={(r) => setOpen(r)} />
      <div className="panel">
        {counts.none > 0 && (
          <div className="alert alert-error" style={{ margin: 16 }}>
            {counts.none} staff number{counts.none === 1 ? ' has' : 's have'} connected calls but not a single recording has reached Callyzer — ask them to check their phones.
          </div>
        )}
        {!rows ? (
          <div className="empty">Loading…</div>
        ) : !rows.length ? (
          <Empty icon={PhoneOff}>No calls in these dates.</Empty>
        ) : (
          <Paged rows={rows} reset={range}>
            {(paged) => (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Staff</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                      <th style={{ textAlign: 'right' }}>Not connected</th>
                      <th style={{ textAlign: 'right' }}>Normal connected</th>
                      <th style={{ textAlign: 'right' }}>WhatsApp</th>
                      <th style={{ textAlign: 'right' }}>On Callyzer</th>
                      <th style={{ textAlign: 'right' }}>Missing</th>
                      <th style={{ textAlign: 'right' }}>After last rec</th>
                      <th>Last connected</th>
                      <th>Last recording</th>
                      <th>Gap</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((r) => {
                      const h = HEALTH[healthOf(r)]
                      const missing = r.normal_connected - r.on_callyzer
                      return (
                        <tr key={r.emp_number} className="is-clickable" title="See their calls" onClick={() => setOpen(r)}>
                          <td>
                            <b>{r.emp_name ?? '—'}</b>
                            <div className="muted small">{r.emp_number}</div>
                          </td>
                          <td className="num" style={{ textAlign: 'right' }}>{r.total}</td>
                          <td className="num muted" style={{ textAlign: 'right' }}>{r.not_connected}</td>
                          <td className="num" style={{ textAlign: 'right' }}><b>{r.normal_connected}</b></td>
                          <td className="num" style={{ textAlign: 'right' }}>{r.whatsapp}</td>
                          <td className="num nowrap" style={{ textAlign: 'right' }}>
                            <b>{r.on_callyzer}</b>{' '}
                            <span className="muted small">({r.normal_connected ? Math.round((r.on_callyzer / r.normal_connected) * 100) : 0}%)</span>
                          </td>
                          <td className={cn('num', missing > 0 && 'tone-danger')} style={{ textAlign: 'right' }}>{missing}</td>
                          <td className="num" style={{ textAlign: 'right' }}>{r.after_last_rec}</td>
                          <td className="small nowrap">{at(r.last_connected)}</td>
                          <td className="small nowrap">{at(r.last_recording)}</td>
                          <td className="small nowrap">{gap(r.last_recording)}</td>
                          <td>
                            <span className={cn('badge', h.cls)}>{h.label}</span>
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
      </div>
      {open && <StaffCalls staff={open} range={range} onClose={() => setOpen(null)} />}
    </>
  )
}

type Call = {
  external_id: string
  started_at: string
  client_number: string | null
  call_type: string | null
  call_method: string | null
  call_mode: string | null
  duration_sec: number
  recording_url: string | null
  recording_path: string | null
  lead_id: string | null
  lead_name: string | null
}
type CallFilter = '' | 'not' | 'normal' | 'whatsapp' | 'missing'
const FILTERS: { id: CallFilter; label: string; test: (c: Call) => boolean }[] = [
  { id: '', label: 'All', test: () => true },
  { id: 'normal', label: 'Normal connected', test: (c) => c.duration_sec > 0 && c.call_method === 'PhoneCall' },
  { id: 'whatsapp', label: 'WhatsApp', test: (c) => c.duration_sec > 0 && c.call_method === 'WhatsAppCall' },
  { id: 'missing', label: 'Missing recording', test: (c) => c.duration_sec > 0 && c.call_method === 'PhoneCall' && !c.recording_url },
  { id: 'not', label: 'Not connected', test: (c) => c.duration_sec === 0 },
]
const TYPE: Record<string, string> = { incoming: 'Incoming', outgoing: 'Outgoing', missed: 'Missed', rejected: 'Rejected' }
const secs = (n: number) => (!n ? '0s' : n >= 3600 ? `${Math.floor(n / 3600)}h ${Math.floor((n % 3600) / 60)}m` : n >= 60 ? `${Math.floor(n / 60)}m ${n % 60}s` : `${n}s`)
const nice = (p: string | null) => (p && p.length === 10 ? `+91 ${p.slice(0, 5)} ${p.slice(5)}` : (p ?? '—'))

/** a staff number's calls in the picked dates */
function StaffCalls({ staff, range, onClose }: { staff: Row; range: Range; onClose: () => void }) {
  const tenant = useTenant()
  const [calls, setCalls] = useState<Call[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<CallFilter>('')

  useEffect(() => {
    const { from, to } = bounds(range)
    db()
      .rpc('callyzer_team_calls_of', { p_tenant: tenant.id, p_emp: staff.emp_number, p_from: from, p_to: to })
      .then(({ data, error: e }) => (e ? setError(e.message) : setCalls((data ?? []) as Call[])))
  }, [tenant.id, staff.emp_number, range])

  const shown = (calls ?? []).filter(FILTERS.find((f) => f.id === filter)!.test)
  return (
    <Drawer open onClose={onClose} title={`${staff.emp_name ?? nice(staff.emp_number)} · calls`} width={900}>
      <div className="stack" style={{ gap: 12 }}>
        <div className="muted small">{nice(staff.emp_number)}</div>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="tabs" role="tablist">
          {FILTERS.map((f) => (
            <button key={f.id || 'all'} type="button" role="tab" className={cn('tab', filter === f.id && 'is-active')} onClick={() => setFilter(f.id)}>
              {f.label} <span className="muted small">{(calls ?? []).filter(f.test).length}</span>
            </button>
          ))}
        </div>
        {!calls ? (
          <div className="empty">Loading…</div>
        ) : !shown.length ? (
          <Empty icon={PhoneOff}>No calls here.</Empty>
        ) : (
          <Paged rows={shown} reset={filter}>
            {(paged) => (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Number</th>
                      <th>Call</th>
                      <th>Type</th>
                      <th>Duration</th>
                      <th>Status</th>
                      <th>Recording</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((c) => {
                      const ok = c.duration_sec > 0
                      return (
                        <tr key={c.external_id}>
                          <td className="small nowrap">{at(c.started_at)}</td>
                          <td>
                            {c.lead_id ? <Link to={`/leads/${c.lead_id}`}><b>{c.lead_name ?? 'Lead'}</b></Link> : <b>{nice(c.client_number)}</b>}
                            {c.lead_id && <div className="muted small">{nice(c.client_number)}</div>}
                          </td>
                          <td className="nowrap">
                            {c.call_method === 'WhatsAppCall' ? <span className="badge badge-success">WhatsApp{c.call_mode === 'Video' ? ' video' : ''}</span> : <span className="badge badge-muted">Normal call</span>}
                          </td>
                          <td>{TYPE[c.call_type ?? ''] ?? '—'}</td>
                          <td className="num nowrap">{secs(c.duration_sec)}</td>
                          <td>
                            <span className={cn('badge', ok ? 'badge-success' : 'badge-muted')}>{ok ? 'Connected' : 'Not connected'}</span>
                          </td>
                          <td>
                            {c.recording_url || c.recording_path ? (
                              <PlayRecording path={c.recording_path} url={c.recording_url} />
                            ) : ok && c.call_method === 'PhoneCall' ? (
                              <span className="tone-danger small">Missing</span>
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
      </div>
    </Drawer>
  )
}
