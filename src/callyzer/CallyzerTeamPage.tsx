import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, MicOff, PhoneOff, RefreshCw, TriangleAlert } from 'lucide-react'
import { DateRangePicker, presetRange, type Range } from '@/components/DateRange'
import { Empty, PageHead, Paged, StatCard } from '@/components/ui'
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

/** Callyzer → Team numbers: per staff number, are recordings reaching Callyzer? (every call, not only to leads) */
export function CallyzerTeamPage() {
  const tenant = useTenant()
  const [range, setRange] = useState<Range>(() => presetRange('today'))
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    const from = new Date(`${range.from}T00:00:00`)
    const to = new Date(`${range.to}T00:00:00`)
    to.setDate(to.getDate() + 1)
    db()
      .rpc('callyzer_team_report', { p_tenant: tenant.id, p_from: from.toISOString(), p_to: to.toISOString() })
      .then(({ data, error: e }) => (e ? setError(e.message) : setRows((data ?? []) as Row[])))
  }, [tenant.id, range])
  useEffect(load, [load])

  const counts = useMemo(() => {
    const list = rows ?? []
    const of = (h: Health) => list.filter((r) => healthOf(r) === h).length
    return { active: of('active'), low: of('low'), none: of('none'), missing: list.reduce((n, r) => n + (r.normal_connected - r.on_callyzer), 0) }
  }, [rows])

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
        <StatCard icon={CheckCircle2} tone="success" value={counts.active} label="Recording active" hint="Arriving on Callyzer" />
        <StatCard icon={TriangleAlert} tone="warning" value={counts.low} label="Low / Stalled" hint="Under half recorded, or 3+ since the last one" />
        <StatCard icon={MicOff} tone="danger" value={counts.none} label="No recording" hint="Nothing received on Callyzer" />
        <StatCard icon={PhoneOff} tone="purple" value={counts.missing} label="Missing recordings" hint="Normal connected calls without a recording" />
      </div>
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
                        <tr key={r.emp_number}>
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
    </>
  )
}
