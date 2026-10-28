import { useMemo, useState } from 'react'
import { CalendarCheck, History, Trash2 } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useBusiness } from '@/business/useBusiness'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { FormSection, Hint, Label, Select, TextArea, TextInput } from '@/components/Field'
import { SearchSelect } from '@/components/SearchSelect'
import { clock, fmtDay, minutesOf } from '@/components/SlotCalendar'
import { fullName } from '@/leads/labels'
import type { LeadRow, MemberOption } from '@/leads/types'
import { useTenant } from '@/tenant/useTenant'
import { deleteMeeting, saveMeeting, type MeetingInput } from './api'
import { MEETING_STATUS, MODE_LABEL, type MeetingMode, type MeetingRow, type MeetingStatus } from './types'

const hm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '')
const today = () => new Date().toISOString().slice(0, 10)

/** Schedule / edit a meeting with a guest. Changing the date or time reschedules it (the old slot stays in its history). */
export function MeetingDrawer({
  meeting,
  defaults,
  lead,
  leads,
  members = [],
  onClose,
  onSaved,
  onBook,
}: {
  meeting: MeetingRow | null
  defaults?: { date?: string; start?: string; end?: string }
  /** fixed guest (lead page) */
  lead?: LeadRow | null
  /** leads to pick from (calendar) */
  leads: LeadRow[]
  /** names for the reschedule history */
  members?: MemberOption[]
  onClose: () => void
  onSaved: (msg: string) => void
  /** qualified: book the podcast for this guest */
  onBook?: (lead: LeadRow) => void
}) {
  const tenant = useTenant()
  const { can, membership } = useAuth()
  const { sub } = useBusiness()
  const canEdit = meeting ? can('meetings', 'edit') : can('meetings', 'add')
  const canDelete = !!meeting && can('meetings', 'delete')
  const [f, setF] = useState<MeetingInput>(() => ({
    lead_id: meeting?.lead_id ?? lead?.id ?? '',
    business_id: meeting?.business_id ?? lead?.business_id ?? '',
    sub_business_id: meeting?.sub_business_id ?? lead?.sub_business_id ?? sub?.id ?? null,
    meeting_date: meeting?.meeting_date ?? defaults?.date ?? today(),
    start_time: hm(meeting?.start_time) || defaults?.start || '11:00',
    end_time: hm(meeting?.end_time) || defaults?.end || '11:30',
    mode: meeting?.mode ?? 'online',
    link: meeting?.link ?? '',
    location: meeting?.location ?? '',
    status: meeting?.status ?? 'scheduled',
    outcome_note: meeting?.outcome_note ?? '',
    assigned_to: meeting?.assigned_to ?? '',
  }))
  const set = <K extends keyof MeetingInput>(k: K, v: MeetingInput[K]) => setF((p) => ({ ...p, [k]: v }))
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  const guest = leads.find((l) => l.id === f.lead_id) ?? lead ?? null
  const options = useMemo(() => leads.filter((l) => !l.is_archived).map((l) => ({ value: l.id, label: `${fullName(l)} · ${l.phone}` })), [leads])
  const moved =
    !!meeting && (meeting.meeting_date !== f.meeting_date || hm(meeting.start_time) !== f.start_time || hm(meeting.end_time) !== f.end_time)
  const history = meeting?.reschedules ?? []
  const who = (id: string | null) => (id && members.find((m) => m.id === id)?.name) || null

  function pickLead(id: string | null) {
    const l = leads.find((x) => x.id === id)
    setF((p) => ({ ...p, lead_id: l?.id ?? '', business_id: l?.business_id ?? '', sub_business_id: l?.sub_business_id ?? sub?.id ?? null }))
  }

  async function save() {
    if (!f.lead_id || !f.business_id) return setError('Pick the guest (lead).')
    if (!f.meeting_date) return setError('Pick the date.')
    if (!f.start_time || !f.end_time || minutesOf(f.end_time) <= minutesOf(f.start_time)) return setError('End time must be after the start time.')
    setBusy(true)
    setError(null)
    try {
      await saveMeeting(tenant.id, membership?.id, meeting, f, reason)
      const name = guest ? fullName(guest) : 'the guest'
      const when = `${fmtDay(f.meeting_date, { day: 'numeric', month: 'short' })}, ${clock(f.start_time)}`
      onSaved(
        !meeting
          ? `Meeting with ${name} on ${when}.`
          : moved
            ? `Meeting rescheduled to ${when}.`
            : f.status === 'not_qualified' && meeting.status !== 'not_qualified'
              ? `${name} marked not qualified; the lead is moved to Lost.`
              : 'Meeting updated.',
      )
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  async function remove() {
    if (!meeting) return
    setBusy(true)
    try {
      await deleteMeeting(meeting.id)
      onSaved('Meeting deleted.')
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width={620}
      title={meeting ? `Meeting · ${guest ? fullName(guest) : ''}` : 'Schedule meeting'}
      footer={
        <>
          {canDelete ? (
            confirmDel ? (
              <Button variant="danger" onClick={remove} disabled={busy}>
                Delete for good?
              </Button>
            ) : (
              <Button variant="ghost" className="danger-text" onClick={() => setConfirmDel(true)} disabled={busy}>
                <Trash2 size={15} /> Delete
              </Button>
            )
          ) : (
            <span />
          )}
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button variant="outline" onClick={onClose}>
              {canEdit ? 'Cancel' : 'Close'}
            </Button>
            {meeting?.status === 'qualified' && guest && onBook && can('bookings', 'add') && (
              <Button variant="outline" onClick={() => onBook(guest)}>
                <CalendarCheck size={15} /> Book podcast
              </Button>
            )}
            {canEdit && (
              <Button onClick={save} disabled={busy}>
                {busy ? 'Saving…' : meeting ? (moved ? 'Reschedule' : 'Save meeting') : 'Schedule meeting'}
              </Button>
            )}
          </div>
        </>
      }
    >
      <div className="stack">
        <FormSection title="Meeting" description={meeting ? undefined : 'A meeting with the guest to decide if they qualify for the podcast.'}>
          <div className="form-grid">
            <div className="span-2">
              <Label htmlFor="mt-lead" required>
                Guest (lead)
              </Label>
              {meeting || lead ? (
                <div className="bk-who">
                  <b>{guest ? `${fullName(guest)} · ${guest.phone}` : '—'}</b>
                </div>
              ) : (
                <SearchSelect id="mt-lead" value={f.lead_id || null} onChange={pickLead} options={options} placeholder="Search a lead…" />
              )}
            </div>
            <div className="span-2">
              <Label htmlFor="mt-date" required>
                Date
              </Label>
              <TextInput id="mt-date" type="date" value={f.meeting_date} onChange={(e) => set('meeting_date', e.target.value)} disabled={!canEdit} />
            </div>
            <div>
              <Label htmlFor="mt-start" required>
                Start time
              </Label>
              <TextInput id="mt-start" type="time" step={900} value={f.start_time} onChange={(e) => set('start_time', e.target.value)} disabled={!canEdit} />
            </div>
            <div>
              <Label htmlFor="mt-end" required>
                End time
              </Label>
              <TextInput id="mt-end" type="time" step={900} value={f.end_time} onChange={(e) => set('end_time', e.target.value)} disabled={!canEdit} />
            </div>
            <div className="span-2">
              <Label htmlFor="mt-host">Team member</Label>
              <Select id="mt-host" value={f.assigned_to} onChange={(e) => set('assigned_to', e.target.value)} disabled={!canEdit}>
                <option value="">—</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
            {moved && (
              <div className="span-2">
                <Label htmlFor="mt-reason">Reason for rescheduling</Label>
                <TextInput id="mt-reason" placeholder="e.g. Guest asked for next week" value={reason} onChange={(e) => setReason(e.target.value)} />
                <Hint>
                  Was {fmtDay(meeting!.meeting_date, { day: 'numeric', month: 'short' })}, {clock(meeting!.start_time)} – {clock(meeting!.end_time)}; it stays in the history.
                </Hint>
              </div>
            )}
            <div>
              <Label htmlFor="mt-mode">Mode</Label>
              <Select id="mt-mode" value={f.mode} onChange={(e) => set('mode', e.target.value as MeetingMode)} disabled={!canEdit}>
                {(Object.keys(MODE_LABEL) as MeetingMode[]).map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABEL[m]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              {f.mode === 'online' ? (
                <>
                  <Label htmlFor="mt-link">Meeting link</Label>
                  <TextInput id="mt-link" placeholder="https://meet.google.com/…" value={f.link} onChange={(e) => set('link', e.target.value)} disabled={!canEdit} />
                  {f.link.startsWith('http') && (
                    <a className="link small" href={f.link} target="_blank" rel="noreferrer">
                      Open link
                    </a>
                  )}
                </>
              ) : (
                <>
                  <Label htmlFor="mt-loc">Location</Label>
                  <TextInput id="mt-loc" placeholder="e.g. Studio, Andheri" value={f.location} onChange={(e) => set('location', e.target.value)} disabled={!canEdit} />
                </>
              )}
            </div>
          </div>
        </FormSection>

        {meeting && (
          <FormSection title="Outcome" description="Qualified → book the podcast. Not qualified → the lead is dropped (moved to Lost).">
            <div className="form-grid">
              <div className="span-2">
                <Label htmlFor="mt-status">Status</Label>
                <Select id="mt-status" value={f.status} onChange={(e) => set('status', e.target.value as MeetingStatus)} disabled={!canEdit}>
                  {(Object.keys(MEETING_STATUS) as MeetingStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {MEETING_STATUS[s].label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="span-2">
                <Label htmlFor="mt-note">Outcome note</Label>
                <TextArea id="mt-note" placeholder="What was discussed, why they qualify or not" value={f.outcome_note} onChange={(e) => set('outcome_note', e.target.value)} disabled={!canEdit} />
              </div>
            </div>
          </FormSection>
        )}

        {history.length > 0 && (
          <FormSection title="Reschedule history">
            <ul className="mt-history">
              {[...history].reverse().map((h, i) => (
                <li key={i}>
                  <History size={14} />
                  <span>
                    <s>
                      {fmtDay(h.date, { day: 'numeric', month: 'short' })}, {clock(h.start)} – {clock(h.end)}
                    </s>
                    {h.reason ? ` · ${h.reason}` : ''}
                    <span className="muted small">
                      {' '}
                      · changed {new Date(h.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                      {who(h.by) ? ` by ${who(h.by)}` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </FormSection>
        )}
      </div>
    </Drawer>
  )
}
