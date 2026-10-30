import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Workflow } from 'lucide-react'
import { Empty } from '@/components/ui'
import { cn } from '@/lib/cn'
import { listWorkflows } from '@/workflows/api'
import { STEP_META, triggerLabel } from '@/workflows/steps'
import type { StepKind, WorkflowRow } from '@/workflows/types'

/** A funnel's workflows: its triggers' funnel (or marked "Used in funnel"), or started by the funnel's webinar / event. */
export function FunnelWorkflowsTab({ tenantId, funnelId, eventId }: { tenantId: string; funnelId: string; eventId: string | null }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState<WorkflowRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listWorkflows(tenantId).then(
      (all) => setRows(all.filter((w) => w.funnel_id === funnelId || (!!eventId && w.event_id === eventId))),
      (e: Error) => setError(e.message),
    )
  }, [tenantId, funnelId, eventId])

  if (error) return <div className="alert alert-error">{error}</div>
  if (!rows) return <div className="empty">Loading workflows…</div>
  if (!rows.length) return <Empty icon={Workflow}>No workflows for this funnel yet. A workflow shows here when its trigger uses this funnel, or when it’s marked “Used in funnel”.</Empty>
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Workflow</th>
            <th>Starts when</th>
            <th>Steps</th>
            <th>Status</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w) => {
            const steps = w.nodes.filter((n) => n.type !== 'trigger')
            const kinds = [...new Set(steps.map((n) => n.type as StepKind))]
            return (
              <tr
                key={w.id}
                className="is-clickable"
                onClick={() => navigate(`/workflows/${w.id}`, { state: { back: { to: `/funnels/${funnelId}?tab=workflows`, label: 'Back to workflows' } } })}
              >
                <td className="strong">{w.name}</td>
                <td>{triggerLabel(w.trigger_type)}</td>
                <td>
                  <div className="wf-kinds">
                    {kinds.map((k) => {
                      const m = STEP_META[k]
                      if (!m) return null
                      const Icon = m.icon
                      return (
                        <span key={k} className="cb-icon" style={{ ['--c' as string]: m.color, width: 24, height: 24 }} title={m.label}>
                          <Icon size={13} />
                        </span>
                      )
                    })}
                    <span className="muted small">{steps.length}</span>
                  </div>
                </td>
                <td>
                  <span className={cn('badge', w.is_active ? 'badge-success' : 'badge-muted')}>{w.is_active ? 'On' : 'Off'}</span>
                </td>
                <td className="muted nowrap">{new Date(w.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
