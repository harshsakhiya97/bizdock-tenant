import { useCallback, useEffect, useState } from 'react'
import { Award, Clock, PhoneCall, PhoneMissed, Percent } from 'lucide-react'
import { isoDay } from '@/components/DateRange'
import { Empty, PageHead, StatCard } from '@/components/ui'
import { cn } from '@/lib/cn'
import { db } from '@/lib/supabase'
import { useTenant } from '@/tenant/useTenant'

type Cz = {
  emp_number: string
  emp_name: string | null
  calls: number
  connected: number
  not_picked: number
  over_1min: number
  talk_sec: number
  first_call: string | null
  last_call: string | null
  calls_7d: number
  ai_review: number
}
type Mem = {
  id: string
  name: string
  role: string | null
  done: number
  done_7d: number
  overdue: number
  due: number
  first_done: string | null
  last_done: string | null
  first_call_pending: number
  no_follow_up: number
}
type Report = { callyzer: Cz[]; members: Mem[] }

const time = (s: string | null) => (s ? new Date(s).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—')
const dur = (sec: number) => {
  if (!sec) return '0s'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`
}
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00`)
  x.setDate(x.getDate() + n)
  return isoDay(x)
}

/** Reports → Team Report: one day's work — a card per Callyzer number (calls) and a card per team member (follow-ups) */
export function TeamReportPage() {
  const tenant = useTenant()
  const today = isoDay(new Date())
  const [day, setDay] = useState(today)
  const [pick, setPick] = useState(today)
  const [data, setData] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    db()
      .rpc('team_report', { p_tenant: tenant.id, p_day: day })
      .then(({ data: d, error: e }) => {
        if (e) setError(e.message)
        else setData(d as Report)
        setLoading(false)
      })
  }, [tenant.id, day])
  useEffect(load, [load])

  const go = (d: string) => {
    setPick(d)
    setDay(d)
  }
  const cz = data?.callyzer ?? []
  const members = data?.members ?? []
  const working = cz.filter((c) => c.calls > 0)
  const t = working.reduce((a, c) => ({ calls: a.calls + c.calls, conn: a.conn + c.connected, over: a.over + c.over_1min, talk: a.talk + c.talk_sec, missed: a.missed + c.not_picked }), { calls: 0, conn: 0, over: 0, talk: 0, missed: 0 })
  const bestCz = working[0]?.connected ? working[0].emp_number : null
  const topDone = members.reduce((m, x) => Math.max(m, x.done), 0)

  return (
    <>
      <PageHead title="Team Report" subtitle={`Daily work of the team · ${dayLabel(day)}`} />
      {error && <div className="alert alert-error">{error}</div>}

      <div className="stat-grid">
        <StatCard icon={PhoneCall} tone="brand" value={t.calls.toLocaleString('en-IN')} label={`Calls ${dayLabel(day).replace(/ \d{4}$/, '')}`} hint={`${t.conn} connected · ${t.over} over 1 min`} />
        <StatCard icon={Percent} tone="orange" value={`${pct(t.conn, t.calls)}%`} label="Completion %" hint="connected ÷ total calls" />
        <StatCard icon={Clock} tone="success" value={dur(t.conn ? Math.round(t.talk / t.conn) : 0)} label="Avg talk time" hint={`per connected call · total ${dur(t.talk)}`} />
        <StatCard icon={PhoneMissed} tone="danger" value={t.missed.toLocaleString('en-IN')} label="Missed / not picked" hint="Retry these calls" />
      </div>

      <div className="tr-bar">
        <span>
          <b>{working.length}</b> of {cz.length} Callyzer numbers calling · <b>{t.calls.toLocaleString('en-IN')}</b> calls that day · <b>{members.filter((m) => m.done > 0).length}</b> of {members.length} team members with follow-ups done
        </span>
        <div className="tr-date">
          <input type="date" className="input input-sm" max={today} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Date" />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => pick && setDay(pick)} disabled={!pick || pick === day}>
            Apply
          </button>
          <button type="button" className={cn('btn btn-sm', day === today ? 'btn-primary' : 'btn-outline')} onClick={() => go(today)}>
            Today
          </button>
          <button type="button" className={cn('btn btn-sm', day === addDays(today, -1) ? 'btn-primary' : 'btn-outline')} onClick={() => go(addDays(today, -1))}>
            Yesterday
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="panel">
          <Empty>Loading…</Empty>
        </div>
      ) : (
        <>
          <h3 className="tr-h">Callyzer numbers · calls</h3>
          {cz.length ? (
            <div className="tr-grid">
              {cz.map((c) => (
                <div key={c.emp_number} className={cn('tr-card', c.emp_number === bestCz && 'is-best')}>
                  <span className="tr-day">{dayLabel(day)}</span>
                  <div className="tr-who">
                    <span className="tr-av">{(c.emp_name ?? c.emp_number).trim().charAt(0).toUpperCase()}</span>
                    <div>
                      {c.emp_number === bestCz && (
                        <span className="badge badge-warning tr-best">
                          <Award size={12} /> Best performer
                        </span>
                      )}
                      <b>{c.emp_name ?? c.emp_number}</b>
                      <div className="muted small">
                        {c.emp_number} · First call: <b>{time(c.first_call)}</b> · Last call: <b>{time(c.last_call)}</b>
                      </div>
                    </div>
                  </div>
                  <div className="tr-boxes">
                    <Box label="Calls" value={c.calls} tone="success" />
                    <Box label="Connected" value={c.connected} tone="success" />
                    <Box label="Not picked" value={c.not_picked} />
                    <Box label="AI review" value={c.ai_review} />
                    <Box label="Over 1 min" value={c.over_1min} />
                    <Box label="Connect %" value={`${pct(c.connected, c.calls)}%`} tone="success" />
                    <Box label="Talk time" value={dur(c.talk_sec)} />
                    <Box label="Avg talk" value={dur(c.connected ? Math.round(c.talk_sec / c.connected) : 0)} />
                    <Box label="Calls (7 days)" value={c.calls_7d} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="panel">
              <Empty>No Callyzer calls in the 7 days up to this date.</Empty>
            </div>
          )}

          <h3 className="tr-h">Team members · follow-ups</h3>
          <div className="tr-grid">
            {members.map((m) => (
              <div key={m.id} className={cn('tr-card', topDone > 0 && m.done === topDone && 'is-best')}>
                <span className="tr-day">{dayLabel(day)}</span>
                <div className="tr-who">
                  <span className="tr-av">{m.name.trim().charAt(0).toUpperCase()}</span>
                  <div>
                    {topDone > 0 && m.done === topDone && (
                      <span className="badge badge-warning tr-best">
                        <Award size={12} /> Best performer
                      </span>
                    )}
                    {m.role && <span className="badge tr-role">{m.role}</span>}
                    <b>{m.name}</b>
                    <div className="muted small">
                      First follow-up: <b>{time(m.first_done)}</b> · Last follow-up: <b>{time(m.last_done)}</b>
                    </div>
                  </div>
                </div>
                <div className="tr-boxes">
                  <Box label="Follow-ups done" value={m.done} tone="success" />
                  <Box label="Due that day" value={m.due} />
                  <Box label="Overdue follow-up" value={m.overdue} tone={m.overdue ? 'danger' : 'success'} />
                  <Box label="First call pending" value={m.first_call_pending} tone={m.first_call_pending ? 'warning' : 'success'} />
                  <Box label="No follow-up date" value={m.no_follow_up} tone={m.no_follow_up ? 'warning' : undefined} />
                  <Box label="Follow-ups (7 days)" value={m.done_7d} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

function Box({ label, value, tone }: { label: string; value: number | string; tone?: 'success' | 'danger' | 'warning' }) {
  return (
    <div className="tr-box">
      <span>{label}</span>
      <b className={tone ? `tr-${tone}` : undefined}>{typeof value === 'number' ? value.toLocaleString('en-IN') : value}</b>
    </div>
  )
}
