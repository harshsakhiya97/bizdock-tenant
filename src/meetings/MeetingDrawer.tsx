import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck, CalendarClock, CircleCheck, History, Trash2, UserX } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useBusiness } from '@/business/useBusiness'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { ConfirmModal } from '@/components/ui'
import { FormSection, Hint, Label, Select, TextArea, TextInput } from '@/components/Field'
import { SearchSelect } from '@/components/SearchSelect'
import { clock, fmtDay, minutesOf } from '@/components/SlotCalendar'
import { fullName, TEMPERATURES } from '@/leads/labels'
import { setLeadCategory } from '@/leads/CategorySelect'
import type { LeadRow, MemberOption, Temperature } from '@/leads/types'
import { useTenant } from '@/tenant/useTenant'
import { listZoomOptions, type ZoomOption } from '@/zoom/api'
import { ZoomPanel } from '@/zoom/ZoomPanel'
import { closeMeeting, deleteMeeting, rescheduleMeeting, saveMeeting, type MeetingInput } from './api'
import { MEETING_STATUS, MODE_LABEL, type MeetingMode, type MeetingRow } from './types'

const hm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '')
/** today / now on this device (local time) */
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const nowHm = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Schedule / edit a meeting with a guest. An upcoming meeting has three buttons: Done (a comment, and the lead's category
 * can be changed), Reschedule (a reason and the new date and time: the same meeting moves, Zoom too, the old slot stays in
 * its history) and No-show (a reason). Meetings never change the lead's stage.
 */
export type MeetingAction = 'done' | 'reschedule' | 'no_show'

export function MeetingDrawer({
  meeting,
  initialAction,
  defaults,
  lead,
  leads,
  members = [],
  onClose,
  onSaved,
  onBook,
}: {
  meeting: MeetingRow | null
  /** open with Done / Reschedule / No-show already picked */
  initialAction?: MeetingAction
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
    zoom_account_id: meeting ? (meeting.zoom_account_id ?? '') : '',
  }))
  // Zoom accounts; a new meeting starts on the default one
  const [zooms, setZooms] = useState<ZoomOption[]>([])
  useEffect(() => {
    void listZoomOptions(tenant.id).then((z) => {
      setZooms(z)
      if (!meeting && z.length) setF((p) => (p.zoom_account_id ? p : { ...p, zoom_account_id: (z.find((x) => x.is_default) ?? z[0]).id }))
    }, () => setZooms([]))
  }, [tenant.id, meeting])
  const onZoom = f.mode === 'online' && !!f.zoom_account_id
  const set = <K extends keyof MeetingInput>(k: K, v: MeetingInput[K]) => setF((p) => ({ ...p, [k]: v }))
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  // the upcoming meeting's action: Done / Reschedule / No-show
  const [act, setAct] = useState<'' | MeetingAction>(meeting?.status === 'scheduled' ? (initialAction ?? '') : '')
  const [note, setNote] = useState('')
  const [cat, setCat] = useState<Temperature | ''>('')
  const [nd, setNd] = useState({ date: '', start: hm(meeting?.start_time), end: hm(meeting?.end_time) })
  const upcoming = meeting?.status === 'scheduled'
  function pickAct(a: '' | 'done' | 'reschedule' | 'no_show') {
    setAct(a)
    setError(null)
    setNote('')
    setCat('')
    if (a === 'reschedule' && meeting) setNd({ date: '', start: hm(meeting.start_time), end: hm(meeting.end_time) })
  }
  async function runAct() {
    if (!meeting || !act) return
    const name = guest ? fullName(guest) : 'the guest'
    if (act === 'reschedule') {
      if (!reason.trim()) return setError('Write why it’s rescheduled.')
      if (!nd.date || !nd.start || !nd.end) return setError('Pick the new date and time.')
      if (minutesOf(nd.end) <= minutesOf(nd.start)) return setError('End time must be after the start time.')
      if (nd.date < today() || (nd.date === today() && nd.start < nowHm())) return setError('Pick a date and time that hasn’t passed yet.')
    } else if (!note.trim()) return setError(act === 'done' ? 'Write a comment about the meeting.' : 'Write the reason.')
    setBusy(true)
    setError(null)
    try {
      if (act === 'reschedule') {
        await rescheduleMeeting(meeting, membership?.id, nd.date, nd.start, nd.end, reason)
        onSaved(`Meeting with ${name} rescheduled to ${fmtDay(nd.date, { day: 'numeric', month: 'short' })}, ${clock(nd.start)}.${meeting.zoom_meeting_id ? ' Its Zoom meeting moves too.' : ''}`)
      } else {
        await closeMeeting(meeting.id, act, note)
        if (act === 'done' && cat && guest && cat !== guest.temperature) await setLeadCategory(tenant.id, membership?.id, guest.id, cat)
        onSaved(act === 'done' ? `Meeting with ${name} marked done.` : `${name} marked no-show.`)
      }
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

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
    // a new meeting, or a new date / time, can't be in the past
    if ((!meeting || moved) && (f.meeting_date < today() || (f.meeting_date === today() && f.start_time < nowHm())))
      return setError('Pick a date and time that hasn’t passed yet.')
    setBusy(true)
    setError(null)
    try {
      await saveMeeting(tenant.id, membership?.id, meeting, f, reason)
      const name = guest ? fullName(guest) : 'the guest'
      const when = `${fmtDay(f.meeting_date, { day: 'numeric', month: 'short' })}, ${clock(f.start_time)}`
      onSaved(
        !meeting
          ? `Meeting with ${name} on ${when}.${onZoom ? ' Its Zoom meeting is being created.' : ''}`
          : moved
            ? `Meeting rescheduled to ${when}.`
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
            <Button variant="ghost" className="danger-text" onClick={() => setConfirmDel(true)} disabled={busy}>
              <Trash2 size={15} /> Delete
            </Button>
          ) : (
            <span />
          )}
          <ConfirmModal
            open={confirmDel}
            icon={Trash2}
            danger
            title="Delete this meeting?"
            message={`The meeting${guest ? ` with ${fullName(guest)}` : ''} is removed for good. This can’t be undone.`}
            confirmLabel={busy ? 'Deleting…' : 'Delete'}
            busy={busy}
            onCancel={() => setConfirmDel(false)}
            onConfirm={() => void remove()}
          />
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button variant="outline" onClick={onClose}>
              {canEdit ? 'Cancel' : 'Close'}
            </Button>
            {meeting?.status === 'done' && guest && onBook && can('bookings', 'add') && (
              <Button variant="outline" onClick={() => onBook(guest)}>
                <CalendarCheck size={15} /> Book podcast
              </Button>
            )}
            {canEdit && act && (
              <Button onClick={runAct} disabled={busy}>
                {busy ? 'Saving…' : act === 'done' ? 'Mark done' : act === 'no_show' ? 'Mark no-show' : 'Reschedule'}
              </Button>
            )}
            {canEdit && !act && (
              <Button onClick={save} disabled={busy}>
                {busy ? 'Saving…' : meeting ? 'Save meeting' : 'Schedule meeting'}
              </Button>
            )}
          </div>
        </>
      }
    >
      <div className="stack">
        {meeting && history.length > 0 && (
          <div className="alert alert-info">
            Previously scheduled {fmtDay(history[history.length - 1].date, { day: 'numeric', month: 'short' })}, {clock(history[history.length - 1].start)}; rescheduled
            {history[history.length - 1].reason ? `: ${history[history.length - 1].reason}` : ''}
            {history.length > 1 ? ` (rescheduled ${history.length}×, see the history below)` : ''}.
          </div>
        )}
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
              <TextInput id="mt-date" type="date" min={today()} value={f.meeting_date} onChange={(e) => set('meeting_date', e.target.value)} disabled={!canEdit || !!meeting} />
            </div>
            <div>
              <Label htmlFor="mt-start" required>
                Start time
              </Label>
              <TextInput id="mt-start" type="time" step={900} min={f.meeting_date === today() ? nowHm() : undefined} value={f.start_time} onChange={(e) => set('start_time', e.target.value)} disabled={!canEdit || !!meeting} />
            </div>
            <div>
              <Label htmlFor="mt-end" required>
                End time
              </Label>
              <TextInput id="mt-end" type="time" step={900} value={f.end_time} onChange={(e) => set('end_time', e.target.value)} disabled={!canEdit || !!meeting} />
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
              {f.mode === 'online' && zooms.length > 0 && (
                <>
                  <Label htmlFor="mt-zoom">Zoom</Label>
                  <Select
                    id="mt-zoom"
                    value={f.zoom_account_id}
                    disabled={!canEdit}
                    onChange={(e) => {
                      const v = e.target.value
                      // leaving Zoom: its link goes too
                      setF((p) => ({ ...p, zoom_account_id: v, link: !v && meeting?.zoom_meeting_id && p.link === meeting.link ? '' : p.link }))
                    }}
                  >
                    <option value="">No Zoom — paste a link</option>
                    {zooms.map((z) => (
                      <option key={z.id} value={z.id}>
                        Create on {z.name}
                        {z.is_default ? ' (default)' : ''}
                      </option>
                    ))}
                  </Select>
                </>
              )}
              {f.mode === 'online' && onZoom ? (
                <Hint>The Zoom meeting is created on save and moves when you reschedule; its link is saved here.</Hint>
              ) : f.mode === 'online' ? (
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

        {meeting && upcoming && canEdit && (
          <FormSection title="Outcome" description="Done, Reschedule or No-show. The lead’s stage doesn’t change.">
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className={`btn btn-sm ${act === 'done' ? 'btn-primary' : 'btn-outline'}`} onClick={() => pickAct(act === 'done' ? '' : 'done')}>
                <CircleCheck size={15} /> Done
              </button>
              <button type="button" className={`btn btn-sm ${act === 'reschedule' ? 'btn-primary' : 'btn-outline'}`} onClick={() => pickAct(act === 'reschedule' ? '' : 'reschedule')}>
                <CalendarClock size={15} /> Reschedule
              </button>
              <button type="button" className={`btn btn-sm ${act === 'no_show' ? 'btn-primary' : 'btn-outline'}`} onClick={() => pickAct(act === 'no_show' ? '' : 'no_show')}>
                <UserX size={15} /> No-show
              </button>
            </div>
            {act === 'done' && (
              <div className="form-grid" style={{ marginTop: 12 }}>
                <div className="span-2">
                  <Label htmlFor="mt-done" required>
                    Comment
                  </Label>
                  <TextArea id="mt-done" placeholder="What was discussed, what’s next" value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                <div className="span-2">
                  <Label htmlFor="mt-cat">Lead’s category</Label>
                  <Select id="mt-cat" value={cat || guest?.temperature || ''} onChange={(e) => setCat(e.target.value as Temperature)}>
                    {!guest?.temperature && <option value="">—</option>}
                    {TEMPERATURES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                  <Hint>Change it if the meeting changed how warm the lead is.</Hint>
                </div>
              </div>
            )}
            {act === 'reschedule' && (
              <div className="form-grid" style={{ marginTop: 12 }}>
                <div className="span-2">
                  <Label htmlFor="mt-nd" required>
                    New date
                  </Label>
                  <TextInput id="mt-nd" type="date" min={today()} value={nd.date} onChange={(e) => setNd((p) => ({ ...p, date: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="mt-ns" required>
                    Start time
                  </Label>
                  <TextInput id="mt-ns" type="time" step={900} value={nd.start} onChange={(e) => setNd((p) => ({ ...p, start: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="mt-ne" required>
                    End time
                  </Label>
                  <TextInput id="mt-ne" type="time" step={900} value={nd.end} onChange={(e) => setNd((p) => ({ ...p, end: e.target.value }))} />
                </div>
                <div className="span-2">
                  <Label htmlFor="mt-reason" required>
                    Reason
                  </Label>
                  <TextInput id="mt-reason" placeholder="e.g. Guest asked for next week" value={reason} onChange={(e) => setReason(e.target.value)} />
                  <Hint>Same guest, team member and Zoom; {meeting.zoom_meeting_id ? 'the Zoom meeting moves to the new time.' : 'only the date and time change.'}</Hint>
                </div>
              </div>
            )}
            {act === 'no_show' && (
              <div className="form-grid" style={{ marginTop: 12 }}>
                <div className="span-2">
                  <Label htmlFor="mt-ns-reason" required>
                    Reason
                  </Label>
                  <TextArea id="mt-ns-reason" placeholder="e.g. Didn’t join, phone switched off" value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
              </div>
            )}
          </FormSection>
        )}

        {meeting && !upcoming && (
          <FormSection title={MEETING_STATUS[meeting.status].label}>
            <div className="form-grid">
              <div className="span-2">
                <Label htmlFor="mt-note">{meeting.status === 'no_show' ? 'Reason' : 'Comment'}</Label>
                <TextArea id="mt-note" value={f.outcome_note} onChange={(e) => set('outcome_note', e.target.value)} disabled={!canEdit} />
              </div>
            </div>
          </FormSection>
        )}

        {meeting && meeting.zoom_account_id && meeting.mode === 'online' && (
          <FormSection title="Zoom" description="Attendance, Q&A and chat from Zoom.">
            <ZoomPanel
              target={{ kind: 'meeting', id: meeting.id }}
              zoomId={meeting.zoom_meeting_id}
              joinUrl={meeting.link}
              startUrl={meeting.zoom_start_url}
              password={meeting.zoom_password}
              error={meeting.zoom_error}
              pulledAt={meeting.zoom_pulled_at}
              accountName={zooms.find((z) => z.id === meeting.zoom_account_id)?.name}
            />
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
