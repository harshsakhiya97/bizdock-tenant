import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { DateRangePicker, presetRange, rangeLabel, type Range } from '@/components/DateRange'
import { StatRecords, type StatCol, type StatShow } from '@/components/StatRecords'
import { Empty, PageHead } from '@/components/ui'
import { cn } from '@/lib/cn'
import { db } from '@/lib/supabase'
import { tempOf } from '@/leads/labels'
import { useTenant } from '@/tenant/useTenant'
import { Box, PersonCard, dayLabel, time, when } from './parts'

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
type Item = {
  id: string
  lead_id: string
  name: string | null
  phone: string | null
  at: string | null
  due_at?: string | null
  completed_at?: string | null
  outcome?: string | null
  note?: string | null
  stage?: string | null
  temperature?: string | null
}
type Kind = 'done' | 'done_7d' | 'due' | 'overdue' | 'first_call_pending' | 'no_follow_up'
const LABEL: Record<Kind, string> = {
  done: 'Follow-ups done',
  done_7d: 'Follow-ups (7 days)',
  due: 'Due',
  overdue: 'Overdue follow-ups',
  first_call_pending: 'First call pending',
  no_follow_up: 'No follow-up date',
}

const lead: StatCol<Item> = {
  label: 'Lead',
  render: (r) => (
    <>
      <b>{r.name ?? 'Lead'}</b>
      {r.phone && <div className="muted small">{r.phone}</div>}
    </>
  ),
}
const none = <span className="muted">—</span>
const COLS: Record<'done' | 'pending' | 'leads', StatCol<Item>[]> = {
  done: [
    lead,
    { label: 'Done at', render: (r) => <span className="nowrap">{when(r.completed_at)}</span> },
    { label: 'Was due', render: (r) => <span className="nowrap">{when(r.due_at)}</span> },
    { label: 'Outcome', render: (r) => r.outcome ?? none },
    { label: 'Note', render: (r) => r.note || none },
  ],
  pending: [lead, { label: 'Due', render: (r) => <span className="nowrap">{when(r.due_at)}</span> }],
  leads: [
    lead,
    { label: 'Stage', render: (r) => r.stage ?? none },
    {
      label: 'Category',
      render: (r) => {
        const t = tempOf((r.temperature ?? null) as Parameters<typeof tempOf>[0])
        return t ? <span className={cn('badge', t.tone)}>{t.label}</span> : none
      },
    },
    { label: 'Lead date', render: (r) => <span className="nowrap">{when(r.at)}</span> },
  ],
}

/** Reports → Team Report: the follow-up work of a date range (this month by default), a card per team member; click any number for its records */
export function TeamReportPage() {
  const tenant = useTenant()
  const navigate = useNavigate()
  const [range, setRange] = useState<Range>(() => presetRange('thisMonth'))
  const { from, to } = range
  const oneDay = from === to
  // a time on one day, else the date and time
  const at = (s: string | null) => (oneDay ? time(s) : when(s))
  const [members, setMembers] = useState<Mem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [show, setShow] = useState<StatShow<Item> | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setError(null)
    db()
      .rpc('team_report_range', { p_tenant: tenant.id, p_from: from, p_to: to })
      .then(({ data, error: e }) => (e ? setError(e.message) : setMembers(((data as { members?: Mem[] } | null)?.members ?? []) as Mem[])))
  }, [tenant.id, from, to])
  useEffect(load, [load])

  async function open(kind: Kind, m: Mem) {
    if (busy) return
    setBusy(true)
    setError(null)
    const { data, error: e } = await db().rpc('team_report_range_list', { p_tenant: tenant.id, p_from: from, p_to: to, p_member: m.id, p_kind: kind })
    setBusy(false)
    if (e) return setError(e.message)
    setShow({
      title: `${LABEL[kind]} · ${m.name} · ${kind === 'done_7d' ? `7 days to ${dayLabel(to)}` : kind === 'done' || kind === 'due' ? rangeLabel(range) : `as of now`}`,
      rows: (data ?? []) as Item[],
      cols: COLS[kind === 'done' || kind === 'done_7d' ? 'done' : kind === 'due' || kind === 'overdue' ? 'pending' : 'leads'],
    })
  }

  const list = members ?? []
  const top = list.reduce((x, m) => Math.max(x, m.done), 0)
  return (
    <>
      <PageHead title="Team Report" subtitle={`Follow-ups of every team member · ${rangeLabel(range)}`} />
      {error && <div className="alert alert-error">{error}</div>}

      <div className="tr-bar">
        <div className="tr-sum">
          <b>{list.filter((m) => m.done > 0).length}</b> of {list.length} team members with follow-ups done · <b>{list.reduce((s, m) => s + m.done, 0).toLocaleString('en-IN')}</b> done in this period
          {busy && <span className="muted"> · Loading…</span>}
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {!members ? (
        <div className="panel">
          <Empty>Loading…</Empty>
        </div>
      ) : (
        <div className="tr-grid">
          {list.map((m) => (
            <PersonCard
              key={m.id}
              name={m.name}
              tag={m.role}
              best={top > 0 && m.done === top}
              facts={[
                <>
                  First follow-up <b>{at(m.first_done)}</b>
                </>,
                <>
                  Last follow-up <b>{at(m.last_done)}</b>
                </>,
              ]}
            >
              <Box label="Follow-ups done" value={m.done} tone="success" onClick={() => void open('done', m)} />
              <Box label={oneDay ? 'Due that day' : 'Due in period'} value={m.due} onClick={() => void open('due', m)} />
              <Box label="Overdue" value={m.overdue} tone={m.overdue ? 'danger' : 'success'} onClick={() => void open('overdue', m)} />
              <Box label="First call pending" value={m.first_call_pending} tone={m.first_call_pending ? 'warning' : 'success'} onClick={() => void open('first_call_pending', m)} />
              <Box label="No follow-up date" value={m.no_follow_up} tone={m.no_follow_up ? 'warning' : undefined} onClick={() => void open('no_follow_up', m)} />
              <Box label="Follow-ups (7 days)" value={m.done_7d} onClick={() => void open('done_7d', m)} />
            </PersonCard>
          ))}
        </div>
      )}

      <StatRecords show={show} onClose={() => setShow(null)} rowKey={(r) => r.id} onRow={(r) => navigate(`/leads/${r.lead_id}`)} />
    </>
  )
}
