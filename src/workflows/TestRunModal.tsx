import { useState, type FormEvent } from 'react'
import { Play } from 'lucide-react'
import { Button } from '@/components/Button'
import { Hint, Label, TextInput } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { db } from '@/lib/supabase'
import type { RefData, WorkflowRow } from './types'

const label = (k: string) => k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
/** fields every lead has; the funnel's forms can add more */
const BASE = [
  { key: 'name', label: 'Name', required: true },
  { key: 'phone', label: 'Phone (WhatsApp)', required: true },
  { key: 'city', label: 'City', required: false },
  { key: 'purpose', label: 'Purpose', required: false },
]
const SKIP = new Set(['name', 'first_name', 'last_name', 'full_name', 'phone', 'whatsapp', 'city', 'purpose', 'company_name', 'note'])

/** Run a workflow once with typed-in lead details (no lead is created; it also works while the workflow is off). */
export function TestRunModal({ workflow, refData, onClose, onStarted }: { workflow: WorkflowRow; refData: RefData | null; onClose: () => void; onStarted: () => void }) {
  const extras = [...new Set((refData?.pages ?? []).filter((p) => p.funnel_id === workflow.funnel_id).flatMap((p) => p.fields))].filter((k) => !SKIP.has(k))
  const fields = [...BASE, ...extras.map((k) => ({ key: k, label: label(k), required: false }))]
  const funnel = refData?.funnels.find((f) => f.id === workflow.funnel_id)
  const [data, setData] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!data.name?.trim()) return setError('Enter a name.')
    if ((data.phone ?? '').replace(/\D/g, '').length < 10) return setError('Enter a valid phone number.')
    setBusy(true)
    setError(null)
    const clean = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v))
    const { error: err } = await db().rpc('workflow_test_run', { p_workflow: workflow.id, p_data: clean })
    setBusy(false)
    if (err) return setError(err.message)
    onStarted()
  }

  return (
    <Modal
      open
      title={`Test run · ${workflow.name}`}
      width={560}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button type="submit" form="wf-test-form" disabled={busy}>
              <Play size={15} /> {busy ? 'Starting…' : 'Run now'}
            </Button>
          </div>
        </>
      }
    >
      <form id="wf-test-form" onSubmit={submit} className="stack">
        <Hint>
          Fill the details a {funnel ? <b>{funnel.name}</b> : 'funnel'} form would send. The workflow runs once for them, with real messages, even if it’s switched off. No lead is
          added.
        </Hint>
        <div className="form-grid">
          {fields.map((f) => (
            <div key={f.key}>
              <Label htmlFor={`wt-${f.key}`} required={f.required}>
                {f.label}
              </Label>
              <TextInput
                id={`wt-${f.key}`}
                type={f.key === 'phone' ? 'tel' : 'text'}
                value={data[f.key] ?? ''}
                onChange={(e) => setData((d) => ({ ...d, [f.key]: e.target.value }))}
                autoFocus={f.key === 'name'}
              />
            </div>
          ))}
        </div>
      </form>
    </Modal>
  )
}
