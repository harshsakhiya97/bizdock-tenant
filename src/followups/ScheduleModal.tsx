import { useState } from 'react'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/Button'
import { Hint, Label, Select, TextInput } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { SearchSelect } from '@/components/SearchSelect'
import type { MemberOption } from '@/leads/types'
import { useTenant } from '@/tenant/useTenant'
import { scheduleFollowUp } from './api'
import { MODES, tomorrowAt11 } from './labels'
import type { FollowUpMode, ScheduleInput } from './types'

/** Add a follow-up (pick a lead) or reschedule one lead's follow-up. */
export function ScheduleModal({
  title,
  lead,
  leads,
  members,
  defaults,
  onClose,
  onSaved,
}: {
  title: string
  /** fixed lead; when missing, a lead picker is shown */
  lead?: { id: string; name: string; owner_id: string | null }
  leads?: { id: string; name: string; owner_id: string | null }[]
  members: MemberOption[]
  defaults?: Partial<ScheduleInput>
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const tenant = useTenant()
  const { membership, can } = useAuth()
  const me = membership?.id
  const [input, setInput] = useState<ScheduleInput>(() => ({
    lead_id: lead?.id ?? '',
    due_at: defaults?.due_at ?? tomorrowAt11(),
    mode: defaults?.mode ?? 'call',
    purpose: defaults?.purpose ?? '',
    assigned_to: defaults?.assigned_to ?? lead?.owner_id ?? me ?? '',
  }))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const canAssign = can('leads', 'assign')

  async function save() {
    if (!input.lead_id) return setError('Pick a lead.')
    if (!input.due_at) return setError('Pick a date and time.')
    setBusy(true)
    setError(null)
    try {
      await scheduleFollowUp(tenant.id, me, input, true)
      onSaved('Follow-up scheduled.')
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
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Schedule'}
            </Button>
          </div>
        </>
      }
    >
      <div className="form-grid">
        <div className="span-2">
          <Label htmlFor="s-lead" required>
            Lead
          </Label>
          {lead ? (
            <TextInput id="s-lead" value={lead.name} disabled />
          ) : (
            <SearchSelect
              id="s-lead"
              value={input.lead_id || null}
              onChange={(v) => {
                const l = leads?.find((x) => x.id === v)
                setInput((d) => ({ ...d, lead_id: v ?? '', assigned_to: l?.owner_id ?? d.assigned_to }))
              }}
              options={(leads ?? []).map((l) => ({ value: l.id, label: l.name }))}
              placeholder="Search leads"
              searchPlaceholder="Name or phone"
            />
          )}
        </div>
        <div>
          <Label htmlFor="s-due" required>
            Date & time
          </Label>
          <TextInput id="s-due" type="datetime-local" value={input.due_at} onChange={(e) => setInput((d) => ({ ...d, due_at: e.target.value }))} />
        </div>
        <div>
          <Label htmlFor="s-mode">Mode</Label>
          <Select id="s-mode" value={input.mode} onChange={(e) => setInput((d) => ({ ...d, mode: e.target.value as FollowUpMode }))}>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="span-2">
          <Label htmlFor="s-purpose">Purpose</Label>
          <TextInput
            id="s-purpose"
            placeholder="e.g. Share the price list, confirm the booking"
            value={input.purpose}
            onChange={(e) => setInput((d) => ({ ...d, purpose: e.target.value }))}
          />
        </div>
        <div className="span-2">
          <Label htmlFor="s-assign">Assigned to</Label>
          <Select
            id="s-assign"
            value={input.assigned_to}
            disabled={!canAssign}
            onChange={(e) => setInput((d) => ({ ...d, assigned_to: e.target.value }))}
          >
            <option value="">— me —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
          <Hint>Any other pending follow-up on this lead is marked “rescheduled”, so the lead has one next step.</Hint>
        </div>
      </div>
    </Modal>
  )
}
