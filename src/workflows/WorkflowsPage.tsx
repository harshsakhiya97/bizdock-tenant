import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Activity, Network, Play, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/Button'
import { Hint, Label, Select, TextInput } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { ConfirmModal, Empty, PageHead, SearchInput } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { archiveWorkflow, createWorkflow, listWorkflows, loadRefData, setWorkflowActive } from './api'
import { STEP_META, TRIGGERS, flowContext, triggerLabel, triggerSummary } from './steps'
import type { RefData, TriggerData, TriggerEvent, WorkflowRow } from './types'
import { Flash } from '@/components/Flash'
import { db } from '@/lib/supabase'
import { RunsList } from './RunsPanel'
import { TestRunModal } from './TestRunModal'

/** Sidebar → Workflows: every workflow with its trigger, steps and on / off. */
export function WorkflowsPage() {
  const tenant = useTenant()
  const navigate = useNavigate()
  const { can, membership } = useAuth()
  const [rows, setRows] = useState<WorkflowRow[] | null>(null)
  const [refData, setRefData] = useState<RefData | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'on' | 'off'>('all')
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<WorkflowRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})
  const [runCounts, setRunCounts] = useState<Map<string, { total: number; waiting: number; failed: number }>>(new Map())
  const [viewing, setViewing] = useState<WorkflowRow | null>(null)
  const [testing, setTesting] = useState<WorkflowRow | null>(null)

  const load = useCallback(() => {
    listWorkflows(tenant.id)
      .then(setRows)
      .catch((e: Error) => setNotice({ error: e.message }))
    void db()
      .from('workflow_runs')
      .select('workflow_id, status')
      .eq('tenant_id', tenant.id)
      .limit(10000)
      .then(({ data }) => {
        const m = new Map<string, { total: number; waiting: number; failed: number }>()
        for (const r of (data ?? []) as { workflow_id: string; status: string }[]) {
          const c = m.get(r.workflow_id) ?? { total: 0, waiting: 0, failed: 0 }
          c.total++
          if (r.status === 'waiting' || r.status === 'queued' || r.status === 'running') c.waiting++
          if (r.status === 'failed') c.failed++
          m.set(r.workflow_id, c)
        }
        setRunCounts(m)
      })
    loadRefData(tenant.id).then(setRefData).catch(() => setRefData({ funnels: [], pages: [], events: [], members: [], workflows: [] }))
  }, [tenant.id])
  useEffect(load, [load])

  const visible = useMemo(
    () =>
      (rows ?? [])
        .filter((w) => filter === 'all' || (filter === 'on') === w.is_active)
        .filter((w) => !query.trim() || w.name.toLowerCase().includes(query.trim().toLowerCase())),
    [rows, filter, query],
  )
  const count = (f: 'all' | 'on' | 'off') => (rows ?? []).filter((w) => f === 'all' || (f === 'on') === w.is_active).length

  async function toggle(w: WorkflowRow) {
    try {
      await setWorkflowActive(w.id, !w.is_active)
      setNotice({ ok: `${w.name} turned ${w.is_active ? 'off' : 'on'}.` })
      load()
    } catch (e) {
      setNotice({ error: (e as Error).message })
    }
  }

  async function remove() {
    if (!deleting) return
    setBusy(true)
    try {
      await archiveWorkflow(deleting.id)
      setNotice({ ok: `${deleting.name} deleted.` })
      load()
    } catch (e) {
      setNotice({ error: (e as Error).message })
    } finally {
      setBusy(false)
      setDeleting(null)
    }
  }

  return (
    <>
      <PageHead
        title="Workflows"
        subtitle="Messages and calls that go out on their own: after a form, before or after a webinar, when a lead moves stage…"
        actions={
          can('workflows', 'add') && (
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> New workflow
            </button>
          )
        }
      />
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      <Flash msg={notice.ok} dep={notice} />

      <div className="panel">
        <div className="panel-bar">
          <div className="tabs">
            {(['all', 'on', 'off'] as const).map((f) => (
              <button key={f} type="button" className={cn('tab', filter === f && 'is-active')} onClick={() => setFilter(f)}>
                {{ all: 'All', on: 'On', off: 'Off' }[f]} <span className="muted small">{count(f)}</span>
              </button>
            ))}
          </div>
          <SearchInput placeholder="Search workflows" value={query} onChange={setQuery} width={220} />
        </div>

        {!rows ? (
          <div className="empty">Loading workflows…</div>
        ) : visible.length === 0 ? (
          <Empty icon={Network}>{rows.length ? 'No workflows match.' : 'No workflows yet. Create one: pick what starts it, then add the steps.'}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Workflow</th>
                  <th>Starts when</th>
                  <th>Steps</th>
                  <th>Runs</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((w) => {
                  const t = (w.nodes.find((n) => n.type === 'trigger')?.data ?? { event: w.trigger_type }) as unknown as TriggerData
                  const ctx = refData ? flowContext(refData, w.nodes) : null
                  const steps = w.nodes.filter((n) => n.type !== 'trigger')
                  const kinds = [...new Set(steps.map((n) => n.type!))]
                  return (
                    <tr key={w.id} className="is-clickable" onClick={() => navigate(`/workflows/${w.id}`)}>
                      <td className="strong">{w.name}</td>
                      <td>
                        <div>{triggerLabel(t.event)}</div>
                        <div className="muted small">{ctx ? triggerSummary(t, ctx) : '…'}</div>
                      </td>
                      <td>
                        <div className="wf-kinds">
                          {kinds.map((k) => {
                            const m = STEP_META[k]
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
                      <td onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="btn btn-outline btn-sm wf-runs-btn" onClick={() => setViewing(w)} title="View runs">
                          <Activity size={14} /> {runCounts.get(w.id)?.total ?? 0}
                        </button>
                        {(runCounts.get(w.id)?.waiting || runCounts.get(w.id)?.failed) ? (
                          <div className="muted small">
                            {runCounts.get(w.id)?.waiting ? `${runCounts.get(w.id)?.waiting} in progress` : ''}
                            {runCounts.get(w.id)?.waiting && runCounts.get(w.id)?.failed ? ' · ' : ''}
                            {runCounts.get(w.id)?.failed ? <span className="text-danger">{runCounts.get(w.id)?.failed} failed</span> : ''}
                          </div>
                        ) : null}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {can('workflows', 'edit') ? (
                          <label className="switch" title={w.is_active ? 'Turn off' : 'Turn on'}>
                            <input type="checkbox" checked={w.is_active} onChange={() => void toggle(w)} aria-label={`${w.name} on`} />
                            <span className={cn('badge', w.is_active ? 'badge-success' : 'badge-muted')}>{w.is_active ? 'On' : 'Off'}</span>
                          </label>
                        ) : (
                          <span className={cn('badge', w.is_active ? 'badge-success' : 'badge-muted')}>{w.is_active ? 'On' : 'Off'}</span>
                        )}
                      </td>
                      <td className="muted nowrap">{new Date(w.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                      <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right' }} className="nowrap">
                        {can('workflows', 'edit') && (
                          <button type="button" className="btn btn-ghost btn-icon" aria-label={`Test run ${w.name}`} title="Test run" onClick={() => setTesting(w)}>
                            <Play size={15} />
                          </button>
                        )}
                        {can('workflows', 'delete') && (
                          <button type="button" className="btn btn-ghost btn-icon danger-text" aria-label={`Delete ${w.name}`} onClick={() => setDeleting(w)}>
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {testing && (
        <TestRunModal
          workflow={testing}
          refData={refData}
          onClose={() => setTesting(null)}
          onStarted={() => {
            setNotice({ ok: 'Test run started.' })
            setViewing(testing)
            setTesting(null)
            load()
          }}
        />
      )}
      {viewing && (
        <Modal open title={`Runs · ${viewing.name}`} width={1100} onClose={() => setViewing(null)}>
          <RunsList workflow={viewing} />
        </Modal>
      )}
      {creating && (
        <NewWorkflowModal
          refData={refData}
          onClose={() => setCreating(false)}
          onCreate={async (name, trigger, funnelId) => {
            const id = await createWorkflow(tenant.id, membership?.id, name, trigger, funnelId)
            navigate(`/workflows/${id}`)
          }}
        />
      )}

      <ConfirmModal
        open={!!deleting}
        icon={Trash2}
        danger
        title={`Delete ${deleting?.name ?? ''}?`}
        message="It stops and is removed from the list. It is kept, so it can be restored later if needed."
        confirmLabel={busy ? 'Deleting…' : 'Delete'}
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      />
    </>
  )
}

function NewWorkflowModal({
  refData,
  onClose,
  onCreate,
}: {
  refData: RefData | null
  onClose: () => void
  onCreate: (name: string, trigger: TriggerEvent, funnelId?: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [trigger, setTrigger] = useState<TriggerEvent>('form_submitted')
  const [funnelId, setFunnelId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const funnelTrigger = trigger === 'form_submitted' || trigger === 'stage_changed' || trigger === 'lead_added'

  async function go() {
    if (!name.trim()) return setError('Give the workflow a name.')
    setBusy(true)
    setError(null)
    try {
      await onCreate(name, trigger, funnelTrigger ? funnelId || undefined : undefined)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={600}
      title="New workflow"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button onClick={go} disabled={busy}>
              {busy ? 'Creating…' : 'Create & open builder'}
            </Button>
          </div>
        </>
      }
    >
      <div className="stack">
        <div>
          <Label htmlFor="wf-name" required>
            Name
          </Label>
          <TextInput id="wf-name" placeholder="e.g. Webinar reminders" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <span className="field-label">Starts when</span>
          <div className="choice-grid">
            {TRIGGERS.map((t) => (
              <button key={t.value} type="button" className={cn('choice', trigger === t.value && 'is-active')} onClick={() => setTrigger(t.value)}>
                <b>{t.label}</b>
                <small>{t.hint}</small>
              </button>
            ))}
          </div>
        </div>
        {funnelTrigger && (
          <div>
            <Label htmlFor="wf-funnel">Funnel</Label>
            <Select id="wf-funnel" value={funnelId} onChange={(e) => setFunnelId(e.target.value)}>
              <option value="">{trigger === 'lead_added' ? 'Any funnel' : '— pick now or in the builder —'}</option>
              {(refData?.funnels ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <Hint>The rest (forms, webinar, timing) is set on the trigger box in the builder.</Hint>
      </div>
    </Modal>
  )
}
