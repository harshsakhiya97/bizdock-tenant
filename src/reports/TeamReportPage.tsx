import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { DateRangePicker, presetRange, rangeLabel, type Range } from '@/components/DateRange'
import { StatRecords, type StatCol, type StatShow } from '@/components/StatRecords'
import { SearchSelect } from '@/components/SearchSelect'
import { Empty, PageHead } from '@/components/ui'
import { useBusiness } from '@/business/useBusiness'
import { listFunnels } from '@/funnels/api'
import type { FunnelRow } from '@/funnels/types'
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
type Nums = Pick<Mem, 'done' | 'done_7d' | 'overdue' | 'due' | 'first_call_pending' | 'no_follow_up'>
type FunRow = Nums & { id: string; name: string; role: string | null }
type Fun = Nums & { id: string; name: string; rows: FunRow[] }
/** the leads with no funnel (the report's "No funnel" group) */
const NO_FUNNEL = '00000000-0000-0000-0000-000000000000'
const KINDS: Kind[] = ['done', 'due', 'overdue', 'first_call_pending', 'no_follow_up', 'done_7d']
const TONE: Partial<Record<Kind, (n: number) => string | undefined>> = {
  done: (n) => (n ? 'tr-success' : undefined),
  overdue: (n) => (n ? 'tr-danger' : undefined),
  first_call_pending: (n) => (n ? 'tr-warning' : undefined),
  no_follow_up: (n) => (n ? 'tr-warning' : undefined),
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
  const { selected, inScope } = useBusiness()
  const [members, setMembers] = useState<Mem[] | null>(null)
  const [funs, setFuns] = useState<Fun[]>([])
  const [error, setError] = useState<string | null>(null)
  const [show, setShow] = useState<StatShow<Item> | null>(null)
  const [busy, setBusy] = useState(false)
  // A: one funnel (or the leads with no funnel); C: the numbers per funnel
  const [funnel, setFunnel] = useState<string | null>(null)
  const [byFunnel, setByFunnel] = useState(false)
  const [funnels, setFunnels] = useState<FunnelRow[]>([])
  useEffect(() => {
    listFunnels(tenant.id).then(setFunnels, () => setFunnels([]))
  }, [tenant.id])
  // the funnels of the business picked in the top bar (every funnel on "All businesses")
  const funnelOpts = useMemo(
    () => [
      { value: '', label: 'All funnels' },
      ...funnels.filter((f) => !selected || inScope(f.business_id, f.sub_business_id)).map((f) => ({ value: f.id, label: f.name })),
      { value: NO_FUNNEL, label: 'No funnel' },
    ],
    [funnels, selected, inScope],
  )
  // a funnel of another business: back to all funnels
  useEffect(() => {
    if (funnel && !funnelOpts.some((o) => o.value === funnel)) setFunnel(null)
  }, [funnel, funnelOpts])
  const business = selected?.id ?? null
  const funnelName = funnel ? funnelOpts.find((o) => o.value === funnel)?.label : null

  const load = useCallback(() => {
    setError(null)
    db()
      .rpc('team_report_range2', { p_tenant: tenant.id, p_from: from, p_to: to, p_business: business, p_funnel: funnel })
      .then(({ data, error: e }) => {
        if (e) return setError(e.message)
        const d = (data ?? {}) as { members?: Mem[]; funnels?: Fun[] }
        setMembers(d.members ?? [])
        setFuns(d.funnels ?? [])
      })
  }, [tenant.id, from, to, business, funnel])
  useEffect(load, [load])

  /** a number's records; `m` null = everyone (a funnel's total); `fid`: that funnel (else the one picked above) */
  async function open(kind: Kind, m: { id: string; name: string } | null, fid?: string, fname?: string) {
    if (busy) return
    setBusy(true)
    setError(null)
    const f = fid ?? funnel
    const { data, error: e } = await db().rpc('team_report_range_list2', {
      p_tenant: tenant.id,
      p_from: from,
      p_to: to,
      p_member: m?.id ?? null,
      p_kind: kind,
      p_business: business,
      p_funnel: f,
    })
    setBusy(false)
    if (e) return setError(e.message)
    const fn = fname ?? funnelName
    setShow({
      title: [LABEL[kind], m?.name ?? 'Everyone', fn, kind === 'done_7d' ? `7 days to ${dayLabel(to)}` : kind === 'done' || kind === 'due' ? rangeLabel(range) : `as of now`].filter(Boolean).join(' · '),
      rows: (data ?? []) as Item[],
      cols: COLS[kind === 'done' || kind === 'done_7d' ? 'done' : kind === 'due' || kind === 'overdue' ? 'pending' : 'leads'],
    })
  }

  const list = members ?? []
  const top = list.reduce((x, m) => Math.max(x, m.done), 0)
  return (
    <>
      <PageHead title="Team Report" subtitle={`Follow-ups of every team member · ${[funnelName, rangeLabel(range)].filter(Boolean).join(' · ')}`} />
      {error && <div className="alert alert-error">{error}</div>}

      <div className="tr-bar">
        <div className="tr-sum">
          <b>{list.filter((m) => m.done > 0).length}</b> of {list.length} team members with follow-ups done · <b>{list.reduce((s, m) => s + m.done, 0).toLocaleString('en-IN')}</b> done in this period
          {busy && <span className="muted"> · Loading…</span>}
        </div>
        <div className="tr-date">
          <div className="seg seg-sm" role="group" aria-label="View">
            <button type="button" className={!byFunnel ? 'is-active' : undefined} onClick={() => setByFunnel(false)}>
              Members
            </button>
            <button type="button" className={byFunnel ? 'is-active' : undefined} onClick={() => setByFunnel(true)}>
              Funnels
            </button>
          </div>
          <SearchSelect
            value={funnel ?? ''}
            onChange={(v) => setFunnel(v || null)}
            options={funnelOpts}
            className="input-sm filter-select"
            style={{ minWidth: 180 }}
            ariaLabel="Funnel"
            searchPlaceholder="Search funnels…"
          />
          <DateRangePicker value={range} onChange={setRange} />
        </div>
      </div>

      {!members ? (
        <div className="panel">
          <Empty>Loading…</Empty>
        </div>
      ) : byFunnel ? (
        !funs.length ? (
          <div className="panel">
            <Empty>No follow-ups or open leads for these dates.</Empty>
          </div>
        ) : (
          <div className="trf-list">
            {funs.map((f) => (
              <div key={f.id} className="trf-card">
                <div className="trf-head">
                  <b>{f.name}</b>
                  <span className="muted small">
                    {f.done.toLocaleString('en-IN')} done · {f.overdue.toLocaleString('en-IN')} overdue
                  </span>
                </div>
                <div className="table-wrap">
                  <table className="table table-compact trf-table">
                    <thead>
                      <tr>
                        <th>Team member</th>
                        {KINDS.map((k) => (
                          <th key={k} className="num">
                            {k === 'due' ? (oneDay ? 'Due that day' : 'Due in period') : k === 'done' ? 'Done' : k === 'overdue' ? 'Overdue' : LABEL[k]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {f.rows.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <b>{r.name}</b>
                            {r.role && <span className="muted small"> · {r.role}</span>}
                          </td>
                          {KINDS.map((k) => (
                            <td key={k} className="num">
                              <Num n={r[k]} tone={TONE[k]?.(r[k])} onClick={() => void open(k, r, f.id, f.name)} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td>
                          <b>Total</b>
                        </td>
                        {KINDS.map((k) => (
                          <td key={k} className="num">
                            <Num n={f[k]} tone={TONE[k]?.(f[k])} onClick={() => void open(k, null, f.id, f.name)} />
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )
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

/** a number in the funnel table; click: its records (0: nothing to open) */
function Num({ n, tone, onClick }: { n: number; tone?: string; onClick: () => void }) {
  if (!n) return <span className="muted">0</span>
  return (
    <button type="button" className={cn('trf-n', tone)} onClick={onClick} title="See the records">
      {n.toLocaleString('en-IN')}
    </button>
  )
}
