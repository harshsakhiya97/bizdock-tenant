import { useMemo, useState } from 'react'
import { AlarmClock, CalendarCheck, CalendarDays, Download, ListTodo, Plus } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { Empty, PageHead, SearchInput, StatCard } from '@/components/ui'
import { fullName } from '@/leads/labels'
import { cn } from '@/lib/cn'
import { CompleteModal } from './CompleteModal'
import { FollowUpTable } from './FollowUpTable'
import { MODES, dayBounds, modeOf } from './labels'
import { ScheduleModal } from './ScheduleModal'
import type { FollowUpRow } from './types'
import { useFollowUpData } from './useFollowUpData'
import { Flash } from '@/components/Flash'

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
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
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
      .filter((f) => !from || new Date(f.due_at) >= new Date(`${from}T00:00`))
      .filter((f) => !to || new Date(f.due_at) <= new Date(`${to}T23:59`))
      .filter(
        (f) =>
          !s ||
          (f.leads && fullName(f.leads).toLowerCase().includes(s)) ||
          (!!digits && (f.leads?.phone ?? '').replace(/\D/g, '').includes(digits)),
      )
  }, [data.followUps, q, assigned, mode, from, to, membership?.id])

  const rows = filtered
    .filter((f) => inTab(f, tab))
    .sort((a, b) => (tab === 'done' ? (b.completed_at ?? '').localeCompare(a.completed_at ?? '') : a.due_at.localeCompare(b.due_at)))
  const count = (t: Tab) => filtered.filter((f) => inTab(f, t)).length

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
        <StatCard icon={AlarmClock} tone="danger" value={count('overdue')} label="Overdue" />
        <StatCard icon={CalendarCheck} tone="warning" value={count('today')} label="Due today" />
        <StatCard icon={CalendarDays} tone="info" value={count('week')} label="Next 7 days" />
        <StatCard icon={ListTodo} tone="purple" value={count('pending')} label="All pending" />
      </div>

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
          <select className="input input-sm filter-select" value={assigned} onChange={(e) => setAssigned(e.target.value)} aria-label="Assigned to">
            <option value="">Assigned to</option>
            <option value="me">Me</option>
            {data.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select className="input input-sm filter-select" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Mode">
            <option value="">Mode</option>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <span className="row muted small" style={{ gap: 6 }}>
            Due from
            <input type="date" className="input input-sm" style={{ width: 150 }} value={from} onChange={(e) => setFrom(e.target.value)} />
            to
            <input type="date" className="input input-sm" style={{ width: 150 }} value={to} onChange={(e) => setTo(e.target.value)} />
          </span>
          {(q || assigned || mode || from || to) && (
            <button
              type="button"
              className="clear-btn"
              onClick={() => {
                setQ('')
                setAssigned('')
                setMode('')
                setFrom('')
                setTo('')
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
