import { useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { FormSection, Hint, Label, TextInput } from '@/components/Field'
import { ConfirmModal } from '@/components/ui'
import { cn } from '@/lib/cn'
import { dateNeighbours, rescheduleWebinarDate, type WebinarRow } from './api'
import { EMPTY_NOTICE, NoticeFields, noticeOf, type NoticeDraft } from './NoticeFields'

const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const clock = (t: string) => new Date(2000, 0, 1, ...(t.slice(0, 5).split(':').map(Number) as [number, number])).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
const todayIst = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)

/**
 * Reschedule one date of a webinar (made, or scheduled) to a new date and time — between the dates before and after it.
 * A weekly webinar asks: only this date, or this and all future dates. A made date's registrants keep their links (its Zoom
 * meeting moves); a WhatsApp can go to them.
 */
export function RescheduleDrawer({
  webinar,
  from,
  madeDates,
  registered,
  onClose,
  onDone,
}: {
  webinar: WebinarRow
  /** the date as it is now */
  from: { date: string; start: string; end: string }
  /** the webinar's made dates (not called off) */
  madeDates: string[]
  /** leads registered for it (a made date) */
  registered: number
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const { membership } = useAuth()
  const [date, setDate] = useState(from.date)
  const [start, setStart] = useState(from.start.slice(0, 5))
  const [end, setEnd] = useState(from.end.slice(0, 5))
  const [send, setSend] = useState(false)
  const [notice, setNotice] = useState<NoticeDraft>(EMPTY_NOTICE)
  const [asking, setAsking] = useState(false)
  const [scope, setScope] = useState<'one' | 'future'>('one')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const weekly = webinar.repeat === 'weekly'
  const { prev, next } = dateNeighbours(webinar, madeDates, from.date, todayIst())

  function check(): string | null {
    if (!date || !start || !end) return 'Fill the new date, start time and end time.'
    if (end <= start) return 'The end time must be after the start time.'
    if (Date.parse(`${date}T${start}:00+05:30`) <= Date.now()) return 'The new date and time must be in the future.'
    if (prev && date <= prev) return `The new date must be after ${fmtDay(prev)} (the date before it).`
    if (next && date >= next) return `The new date must be before ${fmtDay(next)} (the next date).`
    if (date === from.date && start === from.start.slice(0, 5) && end === from.end.slice(0, 5)) return 'Pick a new date or time.'
    if (send) {
      const n = noticeOf(notice)
      if (typeof n === 'string') return n
    }
    return null
  }

  async function save(sc: 'one' | 'future') {
    const n = send ? noticeOf(notice) : null
    setBusy(true)
    setError(null)
    try {
      const r = await rescheduleWebinarDate(webinar, from.date, { date, start, end }, sc, typeof n === 'string' ? null : n, membership?.id)
      onDone(
        `${webinar.title}: ${fmtDay(from.date)} moved to ${fmtDay(date)}, ${clock(start)}${sc === 'future' ? ' — and every week after it on this day and time' : ''}.${r.messages ? ` Sending the message to ${r.messages} registered lead${r.messages === 1 ? '' : 's'}.` : ''}`,
      )
    } catch (e) {
      setAsking(false)
      setError((e as Error).message)
      setBusy(false)
    }
  }

  function submit() {
    const why = check()
    if (why) return setError(why)
    setError(null)
    if (weekly) {
      setScope('one')
      setAsking(true)
    } else void save('one')
  }

  return (
    <Drawer
      open
      width={600}
      onClose={onClose}
      title={`Reschedule · ${webinar.title} · ${fmtDay(from.date)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button onClick={submit} disabled={busy}>
              <CalendarClock size={14} /> {busy ? 'Saving…' : 'Reschedule'}
            </Button>
          </div>
        </>
      }
    >
      <div className="stack">
        <FormSection
          title="New date & time"
          description={`Now ${fmtDay(from.date)}, ${clock(from.start)} – ${clock(from.end)}. ${
            prev || next ? `The new date must be ${prev ? `after ${fmtDay(prev)}` : ''}${prev && next ? ' and ' : ''}${next ? `before ${fmtDay(next)}` : ''}.` : ''
          }`}
        >
          <div className="form-grid form-grid-3">
            <div>
              <Label htmlFor="rs-date" required>
                New date
              </Label>
              <TextInput id="rs-date" type="date" value={date} min={todayIst()} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="rs-start" required>
                Start time
              </Label>
              <TextInput id="rs-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="rs-end" required>
                End time
              </Label>
              <TextInput id="rs-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <Hint>
            {registered
              ? `The ${registered} registered lead${registered === 1 ? ' keeps' : 's keep'} their joining links: the Zoom meeting moves. Reminders, the join link, the WhatsApp group link and the date widget follow the new time.`
              : 'Its WhatsApp group, reminders, the join link and the date widget follow the new time.'}
          </Hint>
        </FormSection>

        {registered > 0 && (
          <FormSection title="Message to registered leads">
            <label className={cn('tgl', send && 'is-on')}>
              <input type="checkbox" role="switch" checked={send} onChange={() => setSend(!send)} aria-label="Send a reschedule message" />
              <span className="tgl-track" aria-hidden="true">
                <span className="tgl-knob" />
              </span>
              Send a WhatsApp to the {registered} registered lead{registered === 1 ? '' : 's'}
            </label>
            {send && <NoticeFields kind="reschedule" value={notice} onChange={setNotice} />}
          </FormSection>
        )}
      </div>

      <ConfirmModal
        open={asking}
        icon={CalendarClock}
        busy={busy}
        title="Reschedule which dates?"
        message={
          <span style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', gap: 10 }}>
            <label className="radio-row">
              <input type="radio" checked={scope === 'one'} onChange={() => setScope('one')} />
              <span>
                <b>Only this webinar</b>: {fmtDay(from.date)} moves to {fmtDay(date)}, {clock(start)}; the weeks after stay as they are.
              </span>
            </label>
            <label className="radio-row">
              <input type="radio" checked={scope === 'future'} onChange={() => setScope('future')} />
              <span>
                <b>This and all future webinars</b>: from {fmtDay(date)}, every {new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long' })} at {clock(start)} – {clock(end)}. Past dates stay.
              </span>
            </label>
          </span>
        }
        confirmLabel={busy ? 'Saving…' : 'Reschedule'}
        onCancel={() => setAsking(false)}
        onConfirm={() => void save(scope)}
      />
    </Drawer>
  )
}
