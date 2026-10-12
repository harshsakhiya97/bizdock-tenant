import { useState, type FormEvent } from 'react'
import { CalendarX, ExternalLink } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Checkbox, FormSection, Hint, Label, Select, TextArea, TextInput } from '@/components/Field'
import { Modal } from '@/components/Modal'
import type { MemberOption } from '@/leads/types'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { cancelEvent, createEvent, seriesDates, updateEvent, type EventInput, type EventRow, type EventType, type Option } from './api'

/** Add / edit an event: type, date (and end date), time, webinar details, team members, repeat. */
export function EventDrawer({
  event,
  defaultDate,
  defaultEndDate,
  defaultTime,
  defaultEndTime,
  types,
  webinarTypes,
  members,
  canEdit,
  onClose,
  onSaved,
}: {
  event: EventRow | null
  defaultDate: string
  defaultEndDate?: string
  /** picked time range in day / week view */
  defaultTime?: string
  defaultEndTime?: string
  types: EventType[]
  webinarTypes: Option[]
  members: MemberOption[]
  canEdit: boolean
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const tenant = useTenant()
  const { businesses, membership } = useAuth()
  const firstType = types.find((t) => t.is_active)
  const [f, setF] = useState<EventInput>(() => ({
    business_id: event?.business_id ?? '',
    type_id: event?.type_id ?? firstType?.id ?? '',
    title: event?.title ?? '',
    topic: event?.topic ?? '',
    event_date: event?.event_date ?? defaultDate,
    end_date: event?.end_date ?? defaultEndDate ?? '',
    start_time: event?.start_time?.slice(0, 5) ?? defaultTime ?? '',
    end_time: event?.end_time?.slice(0, 5) ?? defaultEndTime ?? '',
    webinar_type_id: event?.webinar_type_id ?? '',
    location: event?.location ?? '',
    meeting_link: event?.meeting_link ?? '',
    zoom_webinar_id: event?.zoom_webinar_id ?? '',
    description: event?.description ?? '',
    members: event?.event_members.map((m) => m.member_id) ?? [],
    recurring: false,
    repeat: 'weekly',
    until: '',
  }))
  const [scope, setScope] = useState<'one' | 'series'>('one')
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof EventInput>(k: K, v: EventInput[K]) => setF((d) => ({ ...d, [k]: v }))

  const type = types.find((t) => t.id === f.type_id)
  const kind = type?.kind ?? 'event'
  const ro = !canEdit
  const toggleMember = (id: string) =>
    set('members', f.members.includes(id) ? f.members.filter((m) => m !== id) : [...f.members, id])
  const count = f.recurring && f.until ? seriesDates(f.event_date, f.repeat, f.until).length : 1

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!f.title.trim()) return setError('Enter a title.')
    if (!f.type_id) return setError('Pick the event type.')
    if (!f.event_date) return setError('Pick the date.')
    if (f.end_date && f.end_date < f.event_date) return setError('The end date is before the start date.')
    if (f.start_time && f.end_time && f.end_time <= f.start_time && (!f.end_date || f.end_date === f.event_date)) return setError('The end time is before the start time.')
    if (kind === 'leave' && !f.members.length) return setError('Pick who is on leave.')
    if (!event && f.recurring && !f.until) return setError('Pick until when it repeats.')
    setBusy(true)
    setError(null)
    try {
      if (event) {
        const n = await updateEvent(tenant.id, event, f, scope)
        onSaved(n > 1 ? `${n} events in the series saved.` : `${f.title.trim()} saved.`)
      } else {
        const n = await createEvent(tenant.id, membership?.id, f)
        onSaved(n > 1 ? `${n} events added (${f.repeat}).` : `${f.title.trim()} added.`)
      }
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  async function doCancel() {
    if (!event) return
    setBusy(true)
    try {
      await cancelEvent(event, scope)
      onSaved(scope === 'series' ? 'This and the following events in the series were deleted.' : `${event.title} deleted.`)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Drawer
      open
      width={640}
      onClose={onClose}
      title={event ? (canEdit ? 'Edit event' : event.title) : 'New event'}
      footer={
        <>
          <div className="row">
            <Button variant="outline" onClick={onClose}>
              {canEdit ? 'Cancel' : 'Close'}
            </Button>
            {event && canEdit && (
              <Button variant="ghost" onClick={() => setCancelling(true)}>
                <CalendarX size={15} /> Delete
              </Button>
            )}
          </div>
          {canEdit && (
            <div className="foot-end">
              {error && <p className="err-text">{error}</p>}
              <Button type="submit" form="event-form" disabled={busy}>
                {busy ? 'Saving…' : event ? 'Save changes' : count > 1 ? `Add ${count} events` : 'Add event'}
              </Button>
            </div>
          )}
        </>
      }
    >
      <form id="event-form" onSubmit={submit} className="stack">
        {event?.series_id && canEdit && (
          <div className="alert alert-info row-between">
            <span>This event repeats.</span>
            <span className="seg seg-sm">
              <button type="button" className={cn(scope === 'one' && 'is-active')} onClick={() => setScope('one')}>
                This event
              </button>
              <button type="button" className={cn(scope === 'series' && 'is-active')} onClick={() => setScope('series')}>
                This and following
              </button>
            </span>
          </div>
        )}
        <FormSection title="Event">
          <div className="form-grid">
            <div className="span-2">
              <Label htmlFor="ev-title" required>
                Title
              </Label>
              <TextInput id="ev-title" value={f.title} disabled={ro} onChange={(e) => set('title', e.target.value)} autoFocus={!event} />
            </div>
            <div>
              <Label htmlFor="ev-type" required>
                Event type
              </Label>
              <Select id="ev-type" value={f.type_id} disabled={ro} onChange={(e) => set('type_id', e.target.value)}>
                {types
                  .filter((t) => t.is_active || t.id === f.type_id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="ev-biz">Business</Label>
              <Select id="ev-biz" value={f.business_id} disabled={ro} onChange={(e) => set('business_id', e.target.value)}>
                <option value="">All businesses</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
            {kind !== 'holiday' && kind !== 'leave' && (
              <div className="span-2">
                <Label htmlFor="ev-topic">Topic</Label>
                <TextInput id="ev-topic" value={f.topic} disabled={ro} onChange={(e) => set('topic', e.target.value)} />
              </div>
            )}
          </div>
        </FormSection>

        <FormSection title="When">
          <div className="form-grid">
            <div>
              <Label htmlFor="ev-date" required>
                {kind === 'leave' ? 'From' : 'Date'}
              </Label>
              <TextInput id="ev-date" type="date" value={f.event_date} disabled={ro} onChange={(e) => set('event_date', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ev-end">{kind === 'leave' ? 'To' : 'Ends on (if more than a day)'}</Label>
              <TextInput id="ev-end" type="date" min={f.event_date} value={f.end_date} disabled={ro} onChange={(e) => set('end_date', e.target.value)} />
            </div>
            {kind !== 'holiday' && kind !== 'leave' && (
              <>
                <div>
                  <Label htmlFor="ev-start">Start time</Label>
                  <TextInput id="ev-start" type="time" value={f.start_time} disabled={ro} onChange={(e) => set('start_time', e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="ev-endt">End time</Label>
                  <TextInput id="ev-endt" type="time" value={f.end_time} disabled={ro} onChange={(e) => set('end_time', e.target.value)} />
                  <Hint>Leave the times empty for an all-day event.</Hint>
                </div>
              </>
            )}
          </div>
          {!event && canEdit && kind !== 'leave' && (
            <div className="form-grid" style={{ marginTop: 10 }}>
              <div className="span-2">
                <Checkbox id="ev-rec" checked={f.recurring} onChange={(v) => set('recurring', v)} label="Repeats" />
              </div>
              {f.recurring && (
                <>
                  <div>
                    <Label htmlFor="ev-repeat">Repeat</Label>
                    <Select id="ev-repeat" value={f.repeat} onChange={(e) => set('repeat', e.target.value as EventInput['repeat'])}>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="ev-until" required>
                      Until
                    </Label>
                    <TextInput id="ev-until" type="date" min={f.event_date} value={f.until} onChange={(e) => set('until', e.target.value)} />
                    {f.until && <Hint>{count} events{count >= 104 ? ' (the most at once)' : ''}</Hint>}
                  </div>
                </>
              )}
            </div>
          )}
        </FormSection>

        {kind === 'webinar' && (
          <FormSection title="Webinar">
            <div className="form-grid">
              <div>
                <Label htmlFor="ev-wt">Webinar type</Label>
                <Select id="ev-wt" value={f.webinar_type_id} disabled={ro} onChange={(e) => set('webinar_type_id', e.target.value)}>
                  <option value="">— select —</option>
                  {webinarTypes
                    .filter((w) => w.is_active || w.id === f.webinar_type_id)
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="ev-zoom">Zoom webinar ID</Label>
                <TextInput id="ev-zoom" placeholder="For attendance later" value={f.zoom_webinar_id} disabled={ro} onChange={(e) => set('zoom_webinar_id', e.target.value)} />
              </div>
            </div>
          </FormSection>
        )}

        {kind !== 'holiday' && kind !== 'leave' && (
          <FormSection title="Where">
            <div className="form-grid">
              <div>
                <Label htmlFor="ev-loc">Location</Label>
                <TextInput id="ev-loc" value={f.location} disabled={ro} onChange={(e) => set('location', e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ev-link">Meeting link</Label>
                <TextInput id="ev-link" placeholder="https://zoom.us/…" value={f.meeting_link} disabled={ro} onChange={(e) => set('meeting_link', e.target.value)} />
                {f.meeting_link.startsWith('http') && (
                  <a className="link small" href={f.meeting_link} target="_blank" rel="noreferrer">
                    Open link <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </div>
          </FormSection>
        )}

        {kind !== 'holiday' && (
          <FormSection
            title={kind === 'leave' ? 'Who is on leave' : 'Team members'}
            description={kind === 'leave' ? undefined : 'Leave empty for a company-wide event everyone sees.'}
          >
            <div className="member-picks">
              {members.map((m) => (
                <label key={m.id} className={cn('member-pick', f.members.includes(m.id) && 'is-on')}>
                  <input type="checkbox" checked={f.members.includes(m.id)} disabled={ro} onChange={() => toggleMember(m.id)} />
                  {m.name}
                </label>
              ))}
            </div>
          </FormSection>
        )}

        <FormSection title="Notes">
          <TextArea rows={3} value={f.description} disabled={ro} onChange={(e) => set('description', e.target.value)} aria-label="Description" />
        </FormSection>
      </form>

      <Modal
        open={cancelling}
        onClose={() => setCancelling(false)}
        title={scope === 'series' ? 'Delete this and the following events?' : 'Delete this event?'}
        width={440}
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelling(false)}>
              Keep it
            </Button>
            <Button variant="danger" disabled={busy} onClick={doCancel}>
              Delete
            </Button>
          </>
        }
      >
        <p className="muted">It leaves the calendar. Nothing else changes.</p>
      </Modal>
    </Drawer>
  )
}
