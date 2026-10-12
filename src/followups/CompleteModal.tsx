import { useState } from 'react'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/Button'
import { Checkbox, Label, Select, TextArea, TextInput } from '@/components/Field'
import { Modal } from '@/components/Modal'
import type { Option } from '@/leads/types'
import { useTenant } from '@/tenant/useTenant'
import { completeFollowUp } from './api'
import { MODES, tomorrowAt11 } from './labels'
import type { FollowUpMode, FollowUpRow } from './types'

/** Mark a follow-up done: outcome + note, and (by default) set the next one. */
export function CompleteModal({
  followUp,
  outcomes,
  onClose,
  onSaved,
}: {
  followUp: FollowUpRow
  outcomes: Option[]
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const tenant = useTenant()
  const { membership } = useAuth()
  const me = membership?.id
  const [outcome, setOutcome] = useState('')
  const [note, setNote] = useState('')
  const [planNext, setPlanNext] = useState(true)
  const [next, setNext] = useState({ due_at: tomorrowAt11(), mode: followUp.mode as FollowUpMode, purpose: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const name = followUp.leads ? [followUp.leads.first_name, followUp.leads.last_name].filter(Boolean).join(' ') : 'lead'

  async function save() {
    if (!outcome) return setError('Pick an outcome.')
    if (planNext && !next.due_at) return setError('Pick the next follow-up date.')
    setBusy(true)
    setError(null)
    try {
      await completeFollowUp(
        tenant.id,
        me,
        followUp,
        { outcome_id: outcome, outcome_name: outcomes.find((o) => o.id === outcome)?.name ?? '', note },
        planNext ? { lead_id: followUp.lead_id, ...next, assigned_to: followUp.assigned_to ?? '' } : null,
      )
      onSaved(`Follow-up with ${name} marked done${planNext ? ' and the next one scheduled' : ''}.`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={560}
      title={`Log follow-up · ${name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Mark complete'}
            </Button>
          </div>
        </>
      }
    >
      <div className="form-grid">
        {followUp.purpose && (
          <div className="span-2 note">
            <b>Planned</b>
            {followUp.purpose}
          </div>
        )}
        <div className="span-2">
          <Label htmlFor="c-outcome" required>
            Outcome
          </Label>
          <Select id="c-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="">— select —</option>
            {outcomes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="span-2">
          <Label htmlFor="c-note">What happened</Label>
          <TextArea id="c-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Wants 2 days next month, sending the price list" />
        </div>
        <div className="span-2 check-box">
          <Checkbox id="c-next" checked={planNext} onChange={setPlanNext} label="Schedule the next follow-up" />
          {planNext && (
            <div className="form-grid">
              <div>
                <Label htmlFor="c-due" required>
                  Date & time
                </Label>
                <TextInput id="c-due" type="datetime-local" value={next.due_at} onChange={(e) => setNext((n) => ({ ...n, due_at: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="c-mode">Mode</Label>
                <Select id="c-mode" value={next.mode} onChange={(e) => setNext((n) => ({ ...n, mode: e.target.value as FollowUpMode }))}>
                  {MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="span-2">
                <Label htmlFor="c-purpose">Purpose</Label>
                <TextInput id="c-purpose" value={next.purpose} onChange={(e) => setNext((n) => ({ ...n, purpose: e.target.value }))} />
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
