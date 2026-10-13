import { Suspense, lazy, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, Network } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { Empty } from '@/components/ui'
import { useTenant } from '@/tenant/useTenant'
import { getWorkflow, loadRefData } from './api'
import type { RefData, WorkflowRow } from './types'

// the canvas library is large: loaded only on this page
const WorkflowBuilder = lazy(() => import('./WorkflowBuilder').then((m) => ({ default: m.WorkflowBuilder })))

/** /workflows/:id — the builder for one workflow */
export function WorkflowPage() {
  const { id = '' } = useParams()
  const tenant = useTenant()
  const { can } = useAuth()
  const [wf, setWf] = useState<WorkflowRow | null | undefined>(undefined)
  const [refData, setRefData] = useState<RefData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getWorkflow(id), loadRefData(tenant.id)])
      .then(([w, r]) => {
        setWf(w)
        setRefData(r)
      })
      .catch((e: Error) => setError(e.message))
  }, [id, tenant.id])

  if (error) return <div className="alert alert-error">{error}</div>
  if (wf === undefined || !refData) return <div className="empty">Loading workflow…</div>
  if (!wf)
    return (
      <Empty icon={Network}>
        This workflow doesn’t exist or was deleted. <Link to="/workflows" className="link-btn">Back to workflows</Link>
      </Empty>
    )

  return (
    <>
      <div className="fp-head" style={{ marginBottom: 10 }}>
        <Link to="/workflows" className="link-btn muted small">
          <ArrowLeft size={14} /> All workflows
        </Link>
      </div>
      <div className="panel">
        <div className="panel-body">
          <Suspense fallback={<div className="empty">Loading the builder…</div>}>
            <WorkflowBuilder workflow={wf} refData={refData} canEdit={can('workflows', 'edit')} />
          </Suspense>
        </div>
      </div>
    </>
  )
}
