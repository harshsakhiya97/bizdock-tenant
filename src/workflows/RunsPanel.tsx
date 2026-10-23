import { Fragment, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Check, Circle, Clock, Minus, RefreshCw, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { db } from '@/lib/supabase'
import { STEP_META, unitText } from './steps'
import type { StepKind, StepNode, Unit, WorkflowRow } from './types'

type LogLine = { at: string; node_id: string; kind: string; status: string; detail: string }
export type Run = {
  id: string
  status: 'queued' | 'waiting' | 'running' | 'done' | 'failed' | 'stopped'
  node_id: string
  next_at: string
  error: string | null
  log: LogLine[]
  created_at: string
  updated_at: string
  lead_id: string | null
  leads: { first_name: string; last_name: string | null; phone: string } | null
  is_test: boolean
  test_data: Record<string, string> | null
}

const STATUS: Record<Run['status'], { label: string; tone: string }> = {
  queued: { label: 'Starting', tone: 'badge-info' },
  running: { label: 'Running', tone: 'badge-info' },
  waiting: { label: 'Waiting', tone: 'badge-warning' },
  done: { label: 'Completed', tone: 'badge-success' },
  failed: { label: 'Failed', tone: 'badge-danger' },
  stopped: { label: 'Stopped', tone: 'badge-muted' },
}
type StepState = 'done' | 'current' | 'failed' | 'skipped' | 'stopped' | 'pending'
const STATE_ICON: Record<StepState, typeof Check> = { done: Check, current: Clock, failed: X, skipped: Minus, stopped: X, pending: Circle }
const STATE_LABEL: Record<StepState, string> = { done: 'Done', current: 'Held here', failed: 'Failed', skipped: 'Skipped (not running yet)', stopped: 'Stopped here', pending: 'Pending' }

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
const time = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/** the steps in order, following the main line from the trigger (stops at a Switch / Yes-No box) */
export function stepPath(w: Pick<WorkflowRow, 'nodes' | 'edges'>): StepNode[] {
  const byId = new Map(w.nodes.map((n) => [n.id, n]))
  const out: StepNode[] = []
  const seen = new Set<string>()
  let at = 'trigger'
  for (let i = 0; i < 50; i++) {
    const e = w.edges.find((x) => x.source === at && !x.sourceHandle) ?? w.edges.find((x) => x.source === at)
    const n = e ? byId.get(e.target) : undefined
    if (!n || seen.has(n.id)) break
    out.push(n)
    seen.add(n.id)
    if (n.type === 'switch' || n.type === 'condition') break
    at = n.id
  }
  return out
}

const stepText = (n: StepNode) => {
  const d = n.data ?? {}
  if (n.type === 'whatsapp') return String(d.template || 'no template')
  if (n.type === 'wait') return unitText(Number(d.amount) || 1, (d.unit as Unit) ?? 'days')
  return ''
}

/** what happened to each step in one run */
function states(run: Run, path: StepNode[]): StepState[] {
  const last = new Map(run.log.map((l) => [l.node_id, l]))
  let currentGiven = false
  return path.map((n) => {
    const e = last.get(n.id)
    if (e) {
      if (e.status === 'waiting') return run.status === 'waiting' && run.node_id === n.id ? 'current' : 'done'
      if (e.status === 'ok') return 'done'
      if (e.status === 'skipped') return 'skipped'
      if (e.status === 'failed') return 'failed'
      return 'stopped'
    }
    if ((run.status === 'queued' || run.status === 'running') && !currentGiven) {
      currentGiven = true
      return 'current'
    }
    return 'pending'
  })
}

/** Every run of one workflow: when, for whom, and each step done / held / pending. */
export function RunsList({ workflow }: { workflow: WorkflowRow }) {
  const [runs, setRuns] = useState<Run[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const path = stepPath(workflow)

  const load = useCallback(() => {
    setLoading(true)
    void db()
      .from('workflow_runs')
      .select('id, status, node_id, next_at, error, log, created_at, updated_at, lead_id, is_test, test_data, leads(first_name, last_name, phone)')
      .eq('workflow_id', workflow.id)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setRuns((data ?? []) as unknown as Run[])
        setLoading(false)
      })
  }, [workflow.id])
  useEffect(load, [load])
  // while a run is starting, check again every few seconds
  const busy = (runs ?? []).some((r) => r.status === 'queued' || r.status === 'running')
  useEffect(() => {
    if (!busy) return
    const t = setTimeout(load, 4000)
    return () => clearTimeout(t)
  }, [busy, runs, load])

  const counts = (runs ?? []).reduce<Record<string, number>>((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {})

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row-between">
        <span className="small muted">
          {runs ? `${runs.length} run${runs.length === 1 ? '' : 's'}` : 'Loading…'}
          {runs?.length ? ` · ${counts.done ?? 0} completed · ${counts.waiting ?? 0} waiting · ${counts.failed ?? 0} failed` : ''}
        </span>
        <button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : undefined} /> Refresh
        </button>
      </div>
      <div className="run-legend small muted">
        {(['done', 'current', 'pending', 'failed', 'skipped'] as StepState[]).map((s) => {
          const Icon = STATE_ICON[s]
          return (
            <span key={s} className={`run-dot is-${s}`}>
              <Icon size={11} /> {STATE_LABEL[s]}
            </span>
          )
        })}
      </div>
      {!runs ? null : !runs.length ? (
        <div className="empty">No runs yet. When the workflow is on, each form submission of its funnel starts one.</div>
      ) : (
        <div className="table-wrap run-scroll">
          <table className="table run-table">
            <thead>
              <tr>
                <th>Started</th>
                <th>Lead</th>
                <th>Status</th>
                <th>Steps</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const st = STATUS[r.status]
                const ss = states(r, path)
                return (
                  <Fragment key={r.id}>
                    <tr className="is-clickable" onClick={() => setOpen(open === r.id ? null : r.id)}>
                      <td className="nowrap">{when(r.created_at)}</td>
                      <td className="nowrap">
                        {r.leads ? (
                          <Link to={`/leads/${r.lead_id}`} onClick={(e) => e.stopPropagation()} className="strong">
                            {[r.leads.first_name, r.leads.last_name].filter(Boolean).join(' ')}
                          </Link>
                        ) : r.is_test ? (
                          <span className="strong">{r.test_data?.name ?? 'Test'}</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                        {r.is_test && <span className="badge badge-purple" style={{ marginLeft: 6 }}>Test</span>}
                        {(r.leads?.phone ?? r.test_data?.phone) && <div className="muted small">{r.leads?.phone ?? r.test_data?.phone}</div>}
                      </td>
                      <td className="nowrap">
                        <span className={cn('badge', st.tone)}>{st.label}</span>
                        {r.status === 'waiting' && <div className="muted small">until {time(r.next_at)}</div>}
                      </td>
                      <td>
                        <div className="run-track">
                          <span className="run-step is-done" title="Trigger · started">
                            <Check size={11} />
                            <b>Trigger</b>
                          </span>
                          {path.map((n, i) => {
                            const s = ss[i]
                            const Icon = STATE_ICON[s]
                            const meta = STEP_META[n.type as StepKind]
                            const extra = stepText(n)
                            return (
                              <Fragment key={n.id}>
                                <span className="run-arrow">→</span>
                                <span className={`run-step is-${s}`} title={`${meta?.label ?? n.type}${extra ? ` · ${extra}` : ''} — ${STATE_LABEL[s]}`}>
                                  <Icon size={11} />
                                  <b>{meta?.label ?? n.type}</b>
                                  {extra && <span className="run-extra">{extra}</span>}
                                </span>
                              </Fragment>
                            )
                          })}
                          {!path.length && <span className="muted small">No steps after the trigger.</span>}
                        </div>
                        {r.error && <div className="small text-danger" style={{ marginTop: 4 }}>{r.error}</div>}
                      </td>
                    </tr>
                    {open === r.id && (
                      <tr className="run-detail">
                        <td colSpan={4}>
                          {r.log.length ? (
                            <ol className="run-log">
                              {r.log.map((l, i) => (
                                <li key={i} className={`is-${l.status}`}>
                                  <span className="muted small">{time(l.at)}</span> <b>{STEP_META[l.kind as StepKind]?.label ?? l.kind}</b> · {l.detail}
                                </li>
                              ))}
                            </ol>
                          ) : (
                            <span className="muted small">No step has run yet.</span>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** On the workflow page, under the builder */
export function RunsPanel({ workflow }: { workflow: WorkflowRow }) {
  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="panel-bar">
        <div>
          <b>Runs</b>
          <div className="muted small">Each form submission starts a run when the workflow is on. Click a run for the time of each step.</div>
        </div>
      </div>
      <div className="panel-body">
        <RunsList workflow={workflow} />
      </div>
    </div>
  )
}
