import { useState } from 'react'
import { getLead } from '@/leads/api'
import type { LeadRow } from '@/leads/types'
import { MeetingDrawer } from '@/meetings/MeetingDrawer'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/Button'
import { Hint, Label, Select, TextArea, TextInput } from '@/components/Field'
import { setLeadCategory } from '@/leads/CategorySelect'
import { CALL_CATEGORIES, DAY_ONLY_TIME, ENDS_FOLLOW_UPS, dayFromToday } from '@/leads/labels'
import type { Temperature } from '@/leads/types'
import { Modal } from '@/components/Modal'
import type { Option } from '@/leads/types'
import { useTenant } from '@/tenant/useTenant'
import { clearLeadFollowUps, completeFollowUp } from './api'
import { MODES } from './labels'
import type { FollowUpMode, FollowUpRow } from './types'

/**
 * Mark a follow-up done: outcome, note and the lead's category. Hot / Warm / Cold need the next follow-up's date
 * (a date only — due all that day; quick picks; not a past date); Not interested / Closed end the follow-ups.
 * An outcome about a meeting ("Meeting fixed", …) books the meeting instead of a next follow-up: Mark complete opens
 * the meeting booking, and the follow-up is marked done once the meeting is saved.
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
  const { membership, can } = useAuth()
  const me = membership?.id
  const [outcome, setOutcome] = useState('')
  const [note, setNote] = useState('')
  const current = followUp.leads?.temperature as Temperature | null | undefined
  const [cat, setCat] = useState<Temperature | ''>(current && CALL_CATEGORIES.some((c) => c.value === current) ? current : '')
  const ends = !!cat && ENDS_FOLLOW_UPS.includes(cat)
  const [next, setNext] = useState({ due_at: '', mode: followUp.mode as FollowUpMode, purpose: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // a meeting outcome: the meeting is booked instead of a next follow-up
  const outcomeName = outcomes.find((o) => o.id === outcome)?.name ?? ''
  const meeting = /meeting/i.test(outcomeName) && can('meetings', 'add') && !ends
  const [meetLead, setMeetLead] = useState<LeadRow | null>(null)
  // next.due_at: the picked date (yyyy-mm-dd); kept as that day's 11:59 pm
  const today = dayFromToday(0)
  const pick = (days: number) => setNext((n) => ({ ...n, due_at: dayFromToday(days) }))

  /** the follow-up marked done (no next one) once the meeting is booked */
  async function finishWithMeeting(msg: string) {
    try {
      await completeFollowUp(tenant.id, me, followUp, { outcome_id: outcome, outcome_name: outcomeName, note }, null)
      if (cat && cat !== current) await setLeadCategory(tenant.id, me, followUp.lead_id, cat)
      onSaved(`${msg} Follow-up with ${name} marked done.`)
    } catch (e) {
      setMeetLead(null)
      setError((e as Error).message)
    }
  }
  const name = followUp.leads ? [followUp.leads.first_name, followUp.leads.last_name].filter(Boolean).join(' ') : 'lead'

  async function save() {
    if (!outcome) return setError('Pick an outcome.')
    if (!cat) return setError('Pick the lead’s category.')
    if (meeting) {
      setError(null)
      const l = await getLead(followUp.lead_id).catch(() => null)
      if (!l) return setError('Couldn’t open the lead to book the meeting.')
      return setMeetLead(l)
    }
    if (!ends && !next.due_at) return setError('Pick the next follow-up date.')
    if (!ends && next.due_at < today) return setError('That date has passed — pick today or a later date.')
    setBusy(true)
    setError(null)
    try {
      await completeFollowUp(
        tenant.id,
        me,
        followUp,
        { outcome_id: outcome, outcome_name: outcomes.find((o) => o.id === outcome)?.name ?? '', note },
        ends ? null : { lead_id: followUp.lead_id, ...next, due_at: `${next.due_at}T${DAY_ONLY_TIME}`, assigned_to: followUp.assigned_to ?? '' },
      )
      if (cat !== current) await setLeadCategory(tenant.id, me, followUp.lead_id, cat)
      if (ends) await clearLeadFollowUps(followUp.lead_id)
      onSaved(`Follow-up with ${name} marked done${ends ? '; no more follow-ups' : ' and the next one scheduled'}.`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  if (meetLead)
    return (
      <MeetingDrawer
        meeting={null}
        lead={meetLead}
        leads={[meetLead]}
        onClose={() => setMeetLead(null)}
        onSaved={(msg) => void finishWithMeeting(msg)}
      />
    )

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
              {busy ? 'Saving…' : meeting ? 'Book the meeting' : 'Mark complete'}
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
          <Label htmlFor="c-note">Comments</Label>
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
        {meeting && (
          <div className="span-2 note">
            <b>Book the meeting</b>
            The next step is the meeting, not another call: “Book the meeting” opens the booking (date, time, link, team). The follow-up is marked done once
            the meeting is saved.
          </div>
        )}
        <div className="span-2 check-box" hidden={meeting}>
          {!ends && !meeting && (
            <div className="form-grid">
              <div>
                <Label htmlFor="c-due" required>
                  Next follow-up date
                </Label>
                <TextInput
                  id="c-due"
                  type="date"
                  min={today}
                  value={next.due_at}
                  onChange={(e) => setNext((n) => ({ ...n, due_at: e.target.value }))}
                />
                <div className="row small" style={{ gap: 8, marginTop: 6 }}>
                  <button type="button" className="link" onClick={() => pick(1)}>
                    Tomorrow
                  </button>
                  ·
                  <button type="button" className="link" onClick={() => pick(3)}>
                    +3 days
                  </button>
                  ·
                  <button type="button" className="link" onClick={() => pick(7)}>
                    +7 days
                  </button>
                </div>
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
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
