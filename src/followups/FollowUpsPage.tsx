import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { StatRecords, type StatShow } from '@/components/StatRecords'
import { AlarmClock, CalendarCheck, CalendarDays, Download, ListTodo, Plus } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { Empty, PageHead, SearchInput, StatCard } from '@/components/ui'
import { fullName, TEMPERATURES } from '@/leads/labels'
import { cn } from '@/lib/cn'
import { CompleteModal } from './CompleteModal'
import { FollowUpTable } from './FollowUpTable'
import { MODES, dayBounds, modeOf } from './labels'
import { ScheduleModal } from './ScheduleModal'
import type { FollowUpRow } from './types'
import { useFollowUpData } from './useFollowUpData'
import { Flash } from '@/components/Flash'
import { ALL_DATES, DateRangePicker, type Range } from '@/components/DateRange'
import { Select } from '@/components/Field'

const TABS = [
  { id: 'pending', label: 'Pending' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Next 7 days' },
  { id: 'done', label: 'Completed' },
  { id: 'closed', label: 'Rescheduled / cancelled' },
  { id: 'all', label: 'All' },
] as const
type Tab = (typeof TABS)[number]['id']

export function FollowUpsPage() {
  const { can, membership } = useAuth()
  const data = useFollowUpData()
  const [tab, setTab] = useState<Tab>('pending')
  const [q, setQ] = useState('')
  const [assigned, setAssigned] = useState('')
  const [mode, setMode] = useState('')
  const [cat, setCat] = useState('')
  const [range, setRange] = useState<Range>(ALL_DATES)
  const { from, to } = range
  const [done, setDone] = useState<FollowUpRow | null>(null)
  const [schedule, setSchedule] = useState<{ f: FollowUpRow | null } | null>(null)
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})
  const canAct = can('follow_ups', 'add') || can('leads', 'edit')
  const { now, end, week } = dayBounds()

  const inTab = (f: FollowUpRow, t: Tab) => {
    const d = new Date(f.due_at)
    switch (t) {
      case 'pending':
        return f.status === 'pending'
      case 'overdue':
        return f.status === 'pending' && d < now
      case 'today':
        return f.status === 'pending' && d >= now && d < end
      case 'week':
        return f.status === 'pending' && d >= end && d < week
      case 'done':
        return f.status === 'done'
      case 'closed':
        return f.status === 'rescheduled' || f.status === 'cancelled'
      default:
        return true
    }
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    const digits = s.replace(/\D/g, '')
    return data.followUps
      .filter((f) => !assigned || (assigned === 'me' ? f.assigned_to === membership?.id : f.assigned_to === assigned))
      .filter((f) => !mode || f.mode === mode)
      .filter((f) => !cat || f.leads?.temperature === cat)
      .filter((f) => !from || new Date(f.due_at) >= new Date(`${from}T00:00`))
      .filter((f) => !to || new Date(f.due_at) <= new Date(`${to}T23:59`))
      .filter(
        (f) =>
          !s ||
          (f.leads && fullName(f.leads).toLowerCase().includes(s)) ||
          (!!digits && (f.leads?.phone ?? '').replace(/\D/g, '').includes(digits)),
      )
  }, [data.followUps, q, assigned, mode, cat, from, to, membership?.id])

  const rows = filtered
    .filter((f) => inTab(f, tab))
    .sort((a, b) => (tab === 'done' ? (b.completed_at ?? '').localeCompare(a.completed_at ?? '') : a.due_at.localeCompare(b.due_at)))
  const count = (t: Tab) => filtered.filter((f) => inTab(f, t)).length
  // a stat card's records: those follow-ups
  const navigate = useNavigate()
  const [statShow, setStatShow] = useState<StatShow<FollowUpRow> | null>(null)
  const showTab = (title: string, t: Tab) => () =>
    setStatShow({
      title,
      rows: filtered.filter((f) => inTab(f, t)).sort((a, b) => a.due_at.localeCompare(b.due_at)),
      cols: [
        { label: 'Due', render: (f) => <span className="nowrap">{new Date(f.due_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span> },
        {
          label: 'Lead',
          render: (f) => (
            <>
              <b>{f.leads ? fullName(f.leads) : '—'}</b>
              <div className="muted small">{f.leads?.phone}</div>
            </>
          ),
        },
        { label: 'Mode', render: (f) => modeOf(f.mode).label },
        { label: 'Purpose', render: (f) => f.purpose || <span className="muted">—</span> },
        { label: 'Assigned to', render: (f) => data.members.find((m) => m.id === f.assigned_to)?.name ?? <span className="muted">—</span> },
      ],
    })

  function exportCsv() {
    const out = [
      ['Due', 'Lead', 'Phone', 'Mode', 'Purpose', 'Status', 'Outcome', 'Result', 'Assigned to'],
      ...rows.map((f) => [
        new Date(f.due_at).toLocaleString('en-IN'),
        f.leads ? fullName(f.leads) : '',
        f.leads?.phone ?? '',
        modeOf(f.mode).label,
        f.purpose ?? '',
        f.status,
        data.outcomes.find((o) => o.id === f.outcome_id)?.name ?? '',
        f.result_note ?? '',
        data.members.find((m) => m.id === f.assigned_to)?.name ?? '',
      ]),
    ]
    const csv = out.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'follow-ups.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const saved = (msg: string) => {
    setDone(null)
    setSchedule(null)
    setNotice({ ok: msg })
    data.reload()
  }

  return (
    <>
      <PageHead
        title="Follow-ups"
        subtitle="Calls, messages and meetings planned on leads."
        actions={
          <>
            <button type="button" className="btn btn-outline" onClick={exportCsv} disabled={!rows.length}>
              <Download size={15} /> CSV
            </button>
            {canAct && (
              <button type="button" className="btn btn-primary" onClick={() => setSchedule({ f: null })}>
                <Plus size={16} /> Add follow-up
              </button>
            )}
          </>
        }
      />
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      <Flash msg={notice.ok} dep={notice} />
      {data.error && <div className="alert alert-error">{data.error}</div>}

      <div className="stat-grid">
        <StatCard icon={AlarmClock} tone="danger" value={count('overdue')} label="Overdue" onClick={showTab('Overdue', 'overdue')} />
        <StatCard icon={CalendarCheck} tone="warning" value={count('today')} label="Due today" onClick={showTab('Due today', 'today')} />
        <StatCard icon={CalendarDays} tone="info" value={count('week')} label="Next 7 days" onClick={showTab('Next 7 days', 'week')} />
        <StatCard icon={ListTodo} tone="purple" value={count('pending')} label="All pending" onClick={showTab('All pending', 'pending')} />
      </div>
      <StatRecords show={statShow} onClose={() => setStatShow(null)} rowKey={(f) => f.id} onRow={(f) => navigate(`/leads/${f.lead_id}`)} />

      <div className="panel">
        <div className="panel-bar">
          <div className="tabs">
            {TABS.map((t) => (
              <button key={t.id} type="button" className={cn('tab', tab === t.id && 'is-active')} onClick={() => setTab(t.id)}>
                {t.label} <span className="muted small">{count(t.id)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="panel-filters">
          <SearchInput placeholder="Search name or phone" value={q} onChange={setQ} width={210} />
          <Select className="input input-sm filter-select" value={assigned} onChange={(e) => setAssigned(e.target.value)} aria-label="Assigned to">
            <option value="">Assigned to</option>
            <option value="me">Me</option>
            {data.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
          <Select className="input input-sm filter-select" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Mode">
            <option value="">Mode</option>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
          <Select className="input input-sm filter-select" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
            <option value="">Category</option>
            {TEMPERATURES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          <DateRangePicker allDates future value={range} onChange={setRange} />
          {(q || assigned || mode || from || to) && (
            <button
              type="button"
              className="clear-btn"
              onClick={() => {
                setQ('')
                setAssigned('')
                setMode('')
                setRange(ALL_DATES)
              }}
            >
              Reset
            </button>
          )}
        </div>
        {data.loading ? (
          <div className="empty">Loading follow-ups…</div>
        ) : rows.length === 0 ? (
          <Empty icon={CalendarCheck}>No follow-ups here.</Empty>
        ) : (
          <FollowUpTable
            rows={rows}
            stageById={data.stageById}
            members={data.members}
            outcomes={data.outcomes}
            canAct={canAct}
            onDone={setDone}
            onReschedule={(f) => setSchedule({ f })}
          />
        )}
      </div>

      {done && <CompleteModal followUp={done} outcomes={data.outcomes} onClose={() => setDone(null)} onSaved={saved} />}
      {schedule && (
        <ScheduleModal
          title={schedule.f ? 'Reschedule follow-up' : 'Add follow-up'}
          lead={
            schedule.f?.leads
              ? { id: schedule.f.lead_id, name: fullName(schedule.f.leads), owner_id: schedule.f.leads.owner_id }
              : undefined
          }
          leads={data.leads.map((l) => ({ id: l.id, name: `${fullName(l)} · ${l.phone}`, owner_id: l.owner_id }))}
          members={data.members}
          defaults={schedule.f ? { mode: schedule.f.mode, purpose: schedule.f.purpose ?? '', assigned_to: schedule.f.assigned_to ?? '' } : undefined}
          onClose={() => setSchedule(null)}
          onSaved={saved}
        />
      )}
    </>
  )
}
