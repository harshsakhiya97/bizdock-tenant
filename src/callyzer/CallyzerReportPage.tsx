import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Clock, Percent, PhoneCall, PhoneMissed } from 'lucide-react'
import { DateRangePicker, presetRange, rangeLabel, type Range } from '@/components/DateRange'
import { StatRecords, type StatCol, type StatShow } from '@/components/StatRecords'
import { Empty, PageHead, StatCard } from '@/components/ui'
import { cn } from '@/lib/cn'
import { db } from '@/lib/supabase'
import { useTenant } from '@/tenant/useTenant'
import { Box, PersonCard, dayBounds, dayLabel, dur, pct, time, when } from '@/reports/parts'
import { PlayRecording } from './PlayRecording'

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
  transcribed: boolean
  emp?: string
}
type Kind = 'all' | 'connected' | 'not_picked' | 'over_1min' | 'ai_review' | 'week'
const KIND: Record<Kind, { label: string; test: (c: Call) => boolean }> = {
  all: { label: 'Calls', test: () => true },
  connected: { label: 'Connected', test: (c) => c.duration_sec > 0 },
  not_picked: { label: 'Not picked', test: (c) => !c.duration_sec },
  over_1min: { label: 'Over 1 min', test: (c) => c.duration_sec >= 60 },
  ai_review: { label: 'AI review', test: (c) => c.transcribed },
  week: { label: 'Calls (7 days)', test: () => true },
}
const TYPE: Record<string, string> = { Incoming: 'Incoming', Outgoing: 'Outgoing', Missed: 'Missed', Rejected: 'Rejected' }

/** Callyzer → Report: the calls of a date range (today by default), a card per Callyzer number; click any number for its calls */
export function CallyzerReportPage() {
  const tenant = useTenant()
  const [range, setRange] = useState<Range>(() => presetRange('today'))
  const { from: dFrom, to: dTo } = range
  const oneDay = dFrom === dTo
  const [rows, setRows] = useState<Cz[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [show, setShow] = useState<StatShow<Call> | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setError(null)
    db()
      .rpc('callyzer_range_report', { p_tenant: tenant.id, p_from: dFrom, p_to: dTo })
      .then(({ data, error: e }) => (e ? setError(e.message) : setRows((data ?? []) as Cz[])))
  }, [tenant.id, dFrom, dTo])
  useEffect(load, [load])
  const all = rows ?? []
  const working = all.filter((c) => c.calls > 0)
  const t = working.reduce((a, c) => ({ calls: a.calls + c.calls, conn: a.conn + c.connected, over: a.over + c.over_1min, talk: a.talk + c.talk_sec, missed: a.missed + c.not_picked }), { calls: 0, conn: 0, over: 0, talk: 0, missed: 0 })
  const best = working[0]?.connected ? working[0].emp_number : null
  const nameOf = (n: string) => all.find((c) => c.emp_number === n)?.emp_name ?? n

  /** the calls behind a number: one Callyzer number (or every number that called) */
  async function open(kind: Kind, emp: Cz | null) {
    if (busy) return
    setBusy(true)
    setError(null)
    const { from, to } = kind === 'week' ? dayBounds(dTo, 7) : { from: dayBounds(dFrom).from, to: dayBounds(dTo).to }
    const emps = emp ? [emp] : working
    const lists = await Promise.all(
      emps.map((e) =>
        db()
          .rpc('callyzer_team_calls_of', { p_tenant: tenant.id, p_emp: e.emp_number, p_from: from, p_to: to })
          .then(({ data, error: er }) => {
            if (er) throw er
            return ((data ?? []) as Call[]).map((c) => ({ ...c, emp: e.emp_number }))
          }),
      ),
    ).catch((e: Error) => (setError(e.message), null))
    setBusy(false)
    if (!lists) return
    const calls = lists.flat().filter(KIND[kind].test).sort((a, b) => b.started_at.localeCompare(a.started_at))
    const cols: StatCol<Call>[] = [
      { label: 'Time', render: (c) => <span className="nowrap">{when(c.started_at)}</span> },
      ...(emp ? [] : [{ label: 'By', render: (c: Call) => nameOf(c.emp ?? '') }]),
      {
        label: 'Number',
        render: (c) =>
          c.lead_id ? (
            <>
              <Link to={`/leads/${c.lead_id}`} onClick={() => setShow(null)}>
                <b>{c.lead_name ?? 'Lead'}</b>
              </Link>
              <div className="muted small">{c.client_number}</div>
            </>
          ) : (
            <b>{c.client_number ?? '—'}</b>
          ),
      },
      {
        label: 'Call',
        render: (c) => (
          <span className="nowrap">
            {c.call_method === 'WhatsAppCall' ? <span className="badge badge-success">WhatsApp</span> : <span className="badge badge-muted">Normal</span>} {TYPE[c.call_type ?? ''] ?? ''}
          </span>
        ),
      },
      { label: 'Duration', num: true, render: (c) => dur(c.duration_sec) },
      { label: 'Status', render: (c) => <span className={cn('badge', c.duration_sec > 0 ? 'badge-success' : 'badge-muted')}>{c.duration_sec > 0 ? 'Connected' : 'Not picked'}</span> },
      { label: 'AI review', render: (c) => (c.transcribed ? <span className="badge badge-info">Transcript</span> : <span className="muted">—</span>) },
      { label: 'Recording', render: (c) => (c.recording_url || c.recording_path ? <PlayRecording path={c.recording_path} url={c.recording_url} /> : <span className="muted">—</span>) },
    ]
    const talk = calls.reduce((s, c) => s + c.duration_sec, 0)
    setShow({
      title: `${KIND[kind].label} · ${emp ? (emp.emp_name ?? emp.emp_number) : 'All numbers'} · ${kind === 'week' ? `7 days to ${dayLabel(dTo)}` : rangeLabel(range)}`,
      rows: calls,
      cols,
      foot: `Talk time ${dur(talk)}`,
    })
  }

  return (
    <>
      <PageHead title="Report" subtitle={`Calls of every Callyzer number · ${rangeLabel(range)}`} />
      {error && <div className="alert alert-error">{error}</div>}

      <div className="stat-grid">
        <StatCard icon={PhoneCall} tone="brand" value={t.calls.toLocaleString('en-IN')} label="Calls" hint={`${t.conn} connected · ${t.over} over 1 min`} onClick={() => void open('all', null)} />
        <StatCard icon={Percent} tone="orange" value={`${pct(t.conn, t.calls)}%`} label="Completion %" hint="connected ÷ total calls" onClick={() => void open('connected', null)} />
        <StatCard icon={Clock} tone="success" value={dur(t.conn ? Math.round(t.talk / t.conn) : 0)} label="Avg talk time" hint={`per connected call · total ${dur(t.talk)}`} onClick={() => void open('connected', null)} />
        <StatCard icon={PhoneMissed} tone="danger" value={t.missed.toLocaleString('en-IN')} label="Missed / not picked" hint="Retry these calls" onClick={() => void open('not_picked', null)} />
      </div>

      <div className="tr-bar">
        <div className="tr-sum">
          <b>{working.length}</b> of {all.length} numbers calling · <b>{t.calls.toLocaleString('en-IN')}</b> calls {oneDay ? 'that day' : 'in this period'}
          {busy && <span className="muted"> · Loading…</span>}
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {!rows ? (
        <div className="panel">
          <Empty>Loading…</Empty>
        </div>
      ) : !all.length ? (
        <div className="panel">
          <Empty>No Callyzer calls in this period (or the 7 days up to its end).</Empty>
        </div>
      ) : (
        <div className="tr-grid">
          {all.map((c) => (
            <PersonCard
              key={c.emp_number}
              name={c.emp_name ?? c.emp_number}
              best={c.emp_number === best}
              facts={[
                c.emp_number,
                <>
                  First call <b>{oneDay ? time(c.first_call) : c.first_call ? when(c.first_call) : '—'}</b>
                </>,
                <>
                  Last call <b>{oneDay ? time(c.last_call) : c.last_call ? when(c.last_call) : '—'}</b>
                </>,
              ]}
            >
              <Box label="Calls" value={c.calls} tone="success" onClick={() => void open('all', c)} />
              <Box label="Connected" value={c.connected} tone="success" onClick={() => void open('connected', c)} />
              <Box label="Not picked" value={c.not_picked} tone={c.not_picked ? 'danger' : undefined} onClick={() => void open('not_picked', c)} />
              <Box label="AI review" value={c.ai_review} onClick={() => void open('ai_review', c)} />
              <Box label="Over 1 min" value={c.over_1min} onClick={() => void open('over_1min', c)} />
              <Box label="Connect %" value={`${pct(c.connected, c.calls)}%`} tone="success" onClick={() => void open('connected', c)} />
              <Box label="Talk time" value={dur(c.talk_sec)} onClick={() => void open('connected', c)} />
              <Box label="Avg talk" value={dur(c.connected ? Math.round(c.talk_sec / c.connected) : 0)} onClick={() => void open('connected', c)} />
              <Box label="Calls (7 days)" value={c.calls_7d} onClick={() => void open('week', c)} />
            </PersonCard>
          ))}
        </div>
      )}

      <StatRecords show={show} onClose={() => setShow(null)} rowKey={(c) => c.external_id} />
    </>
  )
}
