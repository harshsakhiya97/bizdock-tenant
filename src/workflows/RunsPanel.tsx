import { Fragment, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/cn'
import { db } from '@/lib/supabase'

type LogLine = { at: string; node_id: string; kind: string; status: string; detail: string }
type Run = {
  id: string
  status: 'queued' | 'waiting' | 'running' | 'done' | 'failed' | 'stopped'
  next_at: string
  error: string | null
  log: LogLine[]
  created_at: string
  lead_id: string | null
  leads: { first_name: string; last_name: string | null; phone: string } | null
}

const STATUS: Record<Run['status'], { label: string; tone: string }> = {
  queued: { label: 'Starting', tone: 'badge-info' },
  running: { label: 'Running', tone: 'badge-info' },
  waiting: { label: 'Waiting', tone: 'badge-warning' },
  done: { label: 'Done', tone: 'badge-success' },
  failed: { label: 'Failed', tone: 'badge-danger' },
  stopped: { label: 'Stopped', tone: 'badge-muted' },
}
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/** The last runs of one workflow: who it ran for and what each step did. */
export function RunsPanel({ workflowId }: { workflowId: string }) {
  const [runs, setRuns] = useState<Run[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    void db()
      .from('workflow_runs')
      .select('id, status, next_at, error, log, created_at, lead_id, leads(first_name, last_name, phone)')
      .eq('workflow_id', workflowId)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        setRuns((data ?? []) as unknown as Run[])
        setLoading(false)
      })
  }, [workflowId])
  useEffect(load, [load])

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="panel-bar">
        <div>
          <b>Runs</b>
          <div className="muted small">Each form submission starts a run when the workflow is on. WhatsApp templates and Wait steps run now; other steps are skipped for the moment.</div>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : undefined} /> Refresh
        </button>
      </div>
      {!runs ? (
        <div className="empty">Loading…</div>
      ) : !runs.length ? (
        <div className="empty">No runs yet. Switch the workflow on; the next form submission of its funnel starts one.</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Started</th>
                <th>Lead</th>
                <th>Status</th>
                <th>Last step</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const last = r.log[r.log.length - 1]
                const st = STATUS[r.status]
                return (
                  <Fragment key={r.id}>
                    <tr className="is-clickable" onClick={() => setOpen(open === r.id ? null : r.id)}>
                      <td className="nowrap">{when(r.created_at)}</td>
                      <td>
                        {r.leads ? (
                          <Link to={`/leads/${r.lead_id}`} onClick={(e) => e.stopPropagation()} className="strong">
                            {[r.leads.first_name, r.leads.last_name].filter(Boolean).join(' ')}
                          </Link>
                        ) : (
                          <span className="muted">—</span>
                        )}
                        {r.leads && <div className="muted small">{r.leads.phone}</div>}
                      </td>
                      <td>
                        <span className={cn('badge', st.tone)}>{st.label}</span>
                        {r.status === 'waiting' && <div className="muted small">until {when(r.next_at)}</div>}
                      </td>
                      <td className={cn('small', r.status === 'failed' && 'text-danger')}>{r.error ?? last?.detail ?? '—'}</td>
                    </tr>
                    {open === r.id && (
                      <tr>
                        <td colSpan={4}>
                          {r.log.length ? (
                            <ol className="run-log">
                              {r.log.map((l, i) => (
                                <li key={i} className={`is-${l.status}`}>
                                  <span className="muted small">{when(l.at)}</span> <b>{l.kind}</b> · {l.detail}
                                </li>
                              ))}
                            </ol>
                          ) : (
                            <span className="muted small">No steps yet.</span>
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
