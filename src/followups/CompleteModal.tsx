import { useState } from 'react'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/Button'
import { Hint, Label, Select, TextArea, TextInput } from '@/components/Field'
import { setLeadCategory } from '@/leads/CategorySelect'
import { CALL_CATEGORIES, ENDS_FOLLOW_UPS } from '@/leads/labels'
import type { Temperature } from '@/leads/types'
import { Modal } from '@/components/Modal'
import type { Option } from '@/leads/types'
import { useTenant } from '@/tenant/useTenant'
import { clearLeadFollowUps, completeFollowUp } from './api'
import { MODES } from './labels'
import type { FollowUpMode, FollowUpRow } from './types'

/**
 * Mark a follow-up done: outcome, note and the lead's category. Hot / Warm / Cold need the next follow-up's date;
 * Not interested / Closed end the follow-ups (no next one, any pending one is cancelled).
 */
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
  const current = followUp.leads?.temperature as Temperature | null | undefined
  const [cat, setCat] = useState<Temperature | ''>(current && CALL_CATEGORIES.some((c) => c.value === current) ? current : '')
  const ends = !!cat && ENDS_FOLLOW_UPS.includes(cat)
  const [next, setNext] = useState({ due_at: '', mode: followUp.mode as FollowUpMode, purpose: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const name = followUp.leads ? [followUp.leads.first_name, followUp.leads.last_name].filter(Boolean).join(' ') : 'lead'

  async function save() {
    if (!outcome) return setError('Pick an outcome.')
    if (!cat) return setError('Pick the lead’s category.')
    if (!ends && !next.due_at) return setError('Pick the next follow-up date & time.')
    setBusy(true)
    setError(null)
    try {
      await completeFollowUp(
        tenant.id,
        me,
        followUp,
        { outcome_id: outcome, outcome_name: outcomes.find((o) => o.id === outcome)?.name ?? '', note },
        ends ? null : { lead_id: followUp.lead_id, ...next, assigned_to: followUp.assigned_to ?? '' },
      )
      if (cat !== current) await setLeadCategory(tenant.id, me, followUp.lead_id, cat)
      if (ends) await clearLeadFollowUps(followUp.lead_id)
      onSaved(`Follow-up with ${name} marked done${ends ? '; no more follow-ups' : ' and the next one scheduled'}.`)
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
        <div className="span-2">
          <Label htmlFor="c-cat" required>
            Lead category
          </Label>
          <Select id="c-cat" value={cat} onChange={(e) => setCat(e.target.value as Temperature | '')}>
            <option value="">— select —</option>
            {CALL_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
          {ends && <Hint>No next follow-up is needed; any pending one for this lead is cancelled.</Hint>}
        </div>
        <div className="span-2 check-box">
          {!ends && (
            <div className="form-grid">
              <div>
                <Label htmlFor="c-due" required>
                  Next follow-up date & time
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
