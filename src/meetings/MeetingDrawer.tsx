import { useEffect, useMemo, useState } from 'react'
import { Ban, CalendarCheck, CalendarClock, CircleCheck, History, Trash2, UserX } from 'lucide-react'
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
import { RecordingPanel } from '@/zoom/RecordingPanel'
import { ZoomPanel } from '@/zoom/ZoomPanel'
import { closeMeeting, deleteMeeting, meetingBusy, rescheduleMeeting, saveMeeting, type Busy, type MeetingInput } from './api'
import { MemberPicker } from './MemberPicker'
import { KIND_LABEL, MEETING_STATUS, MODE_LABEL, type MeetingKind, type MeetingMode, type MeetingRow } from './types'

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
 * Schedule / edit a meeting: with a lead, or a team (internal, company-level) meeting; with one or more team members,
 * each shown as available or busy at that time. An upcoming meeting has three buttons: Done (a comment; a lead meeting
 * can change the lead's category), Reschedule (a reason and the new date and time: the same meeting moves, Zoom too,
 * the old slot stays in its history) and No-show (lead) / Cancelled (team), with a reason. Meetings never change the lead's stage.
 */
export type MeetingAction = 'done' | 'reschedule' | 'no_show' | 'cancelled'

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
  onWebinar,
  initialKind,
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
  /** My Calendar: the third option, Webinar (opens the webinar setup with the same date and time) */
  onWebinar?: (d: { date: string; start: string; end: string }) => void
  /** a new one: Lead or Team (internal) picked first */
  initialKind?: MeetingKind
}) {
  const tenant = useTenant()
  const { can, membership } = useAuth()
  const { sub } = useBusiness()
  const me = membership?.id
  const mine = !!meeting && !!me && (meeting.members.includes(me) || meeting.created_by === me)
  // anyone can add one; a meeting can be changed by its members and who added it (or with the Meetings permissions)
  const canEdit = meeting ? mine || (meeting.kind === 'lead' && can('meetings', 'edit')) : true
  const canDelete = !!meeting && ((!!me && meeting.created_by === me) || can('meetings', 'delete'))
  const [f, setF] = useState<MeetingInput>(() => ({
    kind: meeting?.kind ?? initialKind ?? 'lead',
    title: meeting?.title ?? '',
    agenda: meeting?.agenda ?? '',
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
    members: meeting ? (meeting.members ?? []) : me ? [me] : [],
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
  const team = f.kind === 'team'
  // who is busy at the meeting's time
  const [busyList, setBusyList] = useState<Busy[] | null>(null)
  const [checking, setChecking] = useState(false)
  useEffect(() => {
    if (!f.meeting_date || !f.start_time || !f.end_time || minutesOf(f.end_time) <= minutesOf(f.start_time)) return setBusyList(null)
    let live = true
    setChecking(true)
    const t = setTimeout(() => {
      meetingBusy(tenant.id, f.meeting_date, f.start_time, f.end_time, meeting?.id)
        .then((b) => live && setBusyList(b), () => live && setBusyList(null))
        .finally(() => live && setChecking(false))
    }, 250)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [tenant.id, f.meeting_date, f.start_time, f.end_time, meeting?.id])
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
  // Done on a lead meeting: the lead's category (its own, unless New, until changed here)
  const leadCat = (): Temperature | '' => (guest?.temperature && guest.temperature !== 'new' ? guest.temperature : '')
  function pickAct(a: '' | MeetingAction) {
    setAct(a)
    setError(null)
    setNote('')
    setCat('')
    if (a === 'reschedule' && meeting) setNd({ date: '', start: hm(meeting.start_time), end: hm(meeting.end_time) })
  }
  async function runAct() {
    if (!meeting || !act) return
    const name = team ? f.title || 'the team meeting' : guest ? fullName(guest) : 'the guest'
    if (act === 'reschedule') {
      if (!reason.trim()) return setError('Write why it’s rescheduled.')
      if (!nd.date || !nd.start || !nd.end) return setError('Pick the new date and time.')
      if (minutesOf(nd.end) <= minutesOf(nd.start)) return setError('End time must be after the start time.')
      if (nd.date < today() || (nd.date === today() && nd.start < nowHm())) return setError('Pick a date and time that hasn’t passed yet.')
    } else if (!note.trim()) return setError(act === 'done' ? (team ? 'Write the comments / description of the meeting.' : 'Write a comment about the meeting.') : 'Write the reason.')
    if (act === 'done' && !team && guest && !(cat || leadCat())) return setError('Pick the lead category.')
    setBusy(true)
    setError(null)
    try {
      if (act === 'reschedule') {
        await rescheduleMeeting(meeting, membership?.id, nd.date, nd.start, nd.end, reason)
        onSaved(`${team ? `Team meeting “${name}”` : `Meeting with ${name}`} rescheduled to ${fmtDay(nd.date, { day: 'numeric', month: 'short' })}, ${clock(nd.start)}.${meeting.zoom_meeting_id ? ' Its Zoom meeting moves too.' : ''}`)
      } else {
        await closeMeeting(meeting.id, act, note)
        const nextCat = cat || leadCat()
        if (!team && act === 'done' && nextCat && guest && nextCat !== guest.temperature) await setLeadCategory(tenant.id, membership?.id, guest.id, nextCat)
        onSaved(
          act === 'done'
            ? `${team ? `Team meeting “${name}”` : `Meeting with ${name}`} marked done.`
            : act === 'cancelled'
              ? `Team meeting “${name}” cancelled.`
              : `${name} marked no-show.`,
        )
      }
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const guest = leads.find((l) => l.id === f.lead_id) ?? lead ?? null
  const doneCat = cat || leadCat()
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
    if (team && !f.title.trim()) return setError('Write the meeting’s title.')
    if (!team && (!f.lead_id || !f.business_id)) return setError('Pick the lead.')
    if (!f.members.length) return setError('Pick at least one team member.')
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
      const what = team ? `Team meeting “${f.title.trim()}”` : `Meeting with ${name}`
      const when = `${fmtDay(f.meeting_date, { day: 'numeric', month: 'short' })}, ${clock(f.start_time)}`
      onSaved(
        !meeting
          ? `${what} on ${when}.${onZoom ? ' Its Zoom meeting is being created.' : ''}`
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
      title={meeting ? (meeting.kind === 'team' ? `Team meeting · ${meeting.title ?? ''}` : `Meeting · ${guest ? fullName(guest) : ''}`) : onWebinar ? 'Schedule' : 'Schedule meeting'}
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
            message={`The ${team ? `team meeting${f.title ? ` “${f.title}”` : ''}` : `meeting${guest ? ` with ${fullName(guest)}` : ''}`} is removed for good${meeting?.zoom_meeting_id ? ', and its Zoom meeting too' : ''}. This can’t be undone.`}
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
            {meeting?.status === 'done' && !team && guest && onBook && can('bookings', 'add') && (
              <Button variant="outline" onClick={() => onBook(guest)}>
                <CalendarCheck size={15} /> Book podcast
              </Button>
            )}
            {canEdit && act && (
              <Button onClick={runAct} disabled={busy}>
                {busy ? 'Saving…' : act === 'done' ? 'Mark done' : act === 'no_show' ? 'Mark no-show' : act === 'cancelled' ? 'Cancel meeting' : 'Reschedule'}
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
        <FormSection title="Meeting" description={meeting ? KIND_LABEL[meeting.kind] : undefined}>
          <div className="form-grid">
            {!meeting && !lead && (
              <div className="span-2">
                <Label>Meeting with</Label>
                <div className="seg" role="radiogroup" aria-label="Meeting with">
                  {(['lead', 'team'] as MeetingKind[]).map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={f.kind === k} className={f.kind === k ? 'is-active' : ''} onClick={() => set('kind', k)}>
                      {k === 'lead' ? 'Lead' : 'Team (internal)'}
                    </button>
                  ))}
                  {onWebinar && (
                    <button type="button" role="radio" aria-checked={false} onClick={() => onWebinar({ date: f.meeting_date, start: f.start_time, end: f.end_time })}>
                      Webinar
                    </button>
                  )}
                </div>
                <Hint>{team ? 'An internal meeting of the team, at company level (no lead, not tied to a business).' : 'A meeting with a lead of this business.'}</Hint>
              </div>
            )}
            {team ? (
              <div className="span-2">
                <Label htmlFor="mt-title" required>
                  Title
                </Label>
                <TextInput id="mt-title" placeholder="e.g. Weekly sales review" value={f.title} onChange={(e) => set('title', e.target.value)} disabled={!canEdit} />
              </div>
            ) : (
              <div className="span-2">
                <Label htmlFor="mt-lead" required>
                  Lead
                </Label>
                {meeting || lead ? (
                  <div className="bk-who">
                    <b>{guest ? `${fullName(guest)} · ${guest.phone}` : '—'}</b>
                  </div>
                ) : (
                  <SearchSelect id="mt-lead" value={f.lead_id || null} onChange={pickLead} options={options} placeholder="Search a lead…" />
                )}
              </div>
            )}
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
              <Label htmlFor="mt-agenda">Agenda</Label>
              <TextArea id="mt-agenda" rows={2} placeholder="Optional — what the meeting is about, points to cover" value={f.agenda} onChange={(e) => set('agenda', e.target.value)} disabled={!canEdit} />
            </div>
            <div className="span-2">
              <Label required>Team members</Label>
              <MemberPicker members={members} value={f.members} onChange={(ids) => set('members', ids)} busy={busyList} checking={checking} disabled={!canEdit} />
              {busyList === null && canEdit && <Hint>Pick the date and time to see who is available.</Hint>}
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
          <FormSection title="Outcome" description={team ? 'Done, Reschedule or Cancelled.' : 'Done, Reschedule or No-show. The lead’s stage doesn’t change.'}>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className={`btn btn-sm ${act === 'done' ? 'btn-primary' : 'btn-outline'}`} onClick={() => pickAct(act === 'done' ? '' : 'done')}>
                <CircleCheck size={15} /> Done
              </button>
              <button type="button" className={`btn btn-sm ${act === 'reschedule' ? 'btn-primary' : 'btn-outline'}`} onClick={() => pickAct(act === 'reschedule' ? '' : 'reschedule')}>
                <CalendarClock size={15} /> Reschedule
              </button>
              {team ? (
                <button type="button" className={`btn btn-sm ${act === 'cancelled' ? 'btn-primary' : 'btn-outline'}`} onClick={() => pickAct(act === 'cancelled' ? '' : 'cancelled')}>
                  <Ban size={15} /> Cancelled
                </button>
              ) : (
                <button type="button" className={`btn btn-sm ${act === 'no_show' ? 'btn-primary' : 'btn-outline'}`} onClick={() => pickAct(act === 'no_show' ? '' : 'no_show')}>
                  <UserX size={15} /> No-show
                </button>
              )}
            </div>
            {act === 'done' && (
              <div className="form-grid" style={{ marginTop: 12 }}>
                <div className="span-2">
                  <Label htmlFor="mt-done" required>
                    {team ? 'Comments / description' : 'Comment'}
                  </Label>
                  <TextArea id="mt-done" placeholder="What was discussed, what’s next" value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                {!team && (
                <div className="span-2">
                  <Label htmlFor="mt-cat" required>
                    Lead category
                  </Label>
                  <SearchSelect
                    id="mt-cat"
                    value={doneCat || null}
                    onChange={(v) => setCat((v ?? '') as Temperature | '')}
                    options={TEMPERATURES.filter((t) => t.value !== 'new').map((t) => ({ value: t.value, label: t.label }))}
                    placeholder="— select —"
                    searchPlaceholder="Search…"
                  />
                  <Hint>The lead’s category field: change it if the meeting changed how warm the lead is.</Hint>
                </div>
                )}
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
                  <Hint>Same {team ? '' : 'lead, '}team members and Zoom; {meeting.zoom_meeting_id ? 'the Zoom meeting moves to the new time.' : 'only the date and time change.'}</Hint>
                </div>
              </div>
            )}
            {(act === 'no_show' || act === 'cancelled') && (
              <div className="form-grid" style={{ marginTop: 12 }}>
                <div className="span-2">
                  <Label htmlFor="mt-ns-reason" required>
                    Reason
                  </Label>
                  <TextArea id="mt-ns-reason" placeholder={act === 'cancelled' ? 'e.g. Moved to next week’s review' : 'e.g. Didn’t join, phone switched off'} value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
              </div>
            )}
          </FormSection>
        )}

        {meeting && !upcoming && (
          <FormSection title={MEETING_STATUS[meeting.status].label}>
            <div className="form-grid">
              <div className="span-2">
                <Label htmlFor="mt-note">{meeting.status === 'no_show' || meeting.status === 'cancelled' ? 'Reason' : meeting.kind === 'team' ? 'Comments / description' : 'Comment'}</Label>
                <TextArea id="mt-note" value={f.outcome_note} onChange={(e) => set('outcome_note', e.target.value)} disabled={!canEdit} />
              </div>
            </div>
          </FormSection>
        )}

        {meeting && meeting.zoom_account_id && meeting.mode === 'online' && (
          <FormSection title="Zoom" description="Attendance, Q&A, chat and the recording from Zoom.">
            <ZoomPanel
              target={{ kind: 'meeting', id: meeting.id }}
              zoomId={meeting.zoom_meeting_id}
              joinUrl={meeting.link}
              startUrl={meeting.zoom_start_url}
              password={meeting.zoom_password}
              error={meeting.zoom_error}
              pulledAt={meeting.zoom_pulled_at}
              accountName={zooms.find((z) => z.id === meeting.zoom_account_id)?.name}
              topic={meeting.kind === 'team' ? (meeting.title ?? 'Team meeting') : meeting.title || `Meeting with ${guest ? fullName(guest) : 'us'}`}
              day={meeting.meeting_date}
              time={meeting.start_time}
              ended={meeting.status !== 'scheduled'}
            />
          </FormSection>
        )}

        {/* not on Zoom: a recording can still be added by hand (Zoom meetings have it in the Zoom panel's Recording tab) */}
        {meeting && !(meeting.zoom_account_id && meeting.mode === 'online') && (
          <FormSection title="Recording" description="A recording added by hand (a file or a link), with its summary and transcript.">
            <RecordingPanel target={{ kind: 'meeting', id: meeting.id }} />
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
