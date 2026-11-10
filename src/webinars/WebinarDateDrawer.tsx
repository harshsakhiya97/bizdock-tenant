import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { CalendarClock, Check, Copy, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { FormSection, Hint } from '@/components/Field'
import { ConfirmModal, Empty, Paged } from '@/components/ui'
import { cn } from '@/lib/cn'
import { archiveWebinar, categoryLook, dateNeighbours, deleteWebinarDate, joinLink, listRegistrations, listZoomData, plannedSlots, pullZoom, type Attendance, type Registration, type WebinarDate, type WebinarRow, type ZoomComment } from './api'
import { EMPTY_NOTICE, NoticeFields, noticeOf, type NoticeDraft } from './NoticeFields'
import { RescheduleDrawer } from './RescheduleDrawer'

const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const clock = (t: string | null) => (t ? new Date(2000, 0, 1, ...(t.slice(0, 5).split(':').map(Number) as [number, number])).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '')
const at = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '—')
const leadName = (r: Registration) => [r.leads?.first_name, r.leads?.last_name].filter(Boolean).join(' ') || 'Lead'
const todayIst = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)

/** One date of a webinar: its Zoom webinar, who registered (and their category after it), attendance, Q&A, chat and polls. */
export function WebinarDateDrawer({
  date,
  webinar,
  siblings,
  onClose,
  onEdit,
  onDeleted,
}: {
  date: WebinarDate
  webinar: WebinarRow | null
  /** the webinar's made dates (not called off), for the date before / after it */
  siblings: WebinarDate[]
  onClose: () => void
  onEdit: () => void
  /** deleted or rescheduled */
  onDeleted: (msg: string) => void
}) {
  const { can, membership } = useAuth()
  const canEdit = can('bookings', 'edit') || can('bookings', 'add')
  const [regs, setRegs] = useState<Registration[] | null>(null)
  const [zoom, setZoom] = useState<{ attendance: Attendance[]; comments: ZoomComment[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({})
  const [copied, setCopied] = useState('')
  // delete: only this date, or the whole webinar (a one-time webinar has just the one date)
  const [removing, setRemoving] = useState(false)
  const [scope, setScope] = useState<'date' | 'all'>('date')
  const oneDate = !webinar || webinar.repeat === 'once'
  // a date with registered leads: its delete asks (in a drawer) whether to move them to the next date
  const [deleting, setDeleting] = useState(false)
  const [rescheduling, setRescheduling] = useState(false)

  const load = useCallback(() => {
    void listRegistrations({ eventId: date.id }).then(setRegs, () => setRegs([]))
    void listZoomData({ eventId: date.id }).then(setZoom, () => setZoom({ attendance: [], comments: [] }))
  }, [date.id])
  useEffect(load, [load])

  const ended = Date.parse(`${date.event_date}T${(date.end_time ?? date.start_time).slice(0, 5)}:00+05:30`) < Date.now()
  const started = Date.parse(`${date.event_date}T${date.start_time.slice(0, 5)}:00+05:30`) <= Date.now()
  const active = (regs ?? []).filter((r) => !r.moved_to_event)
  const attByLead = useMemo(() => {
    const m = new Map<string, Attendance>()
    for (const a of zoom?.attendance ?? []) if (a.lead_id) m.set(a.lead_id, a)
    return m
  }, [zoom])
  const counts = useMemo(() => {
    const c = { qa: 0, chat: 0, poll: 0 }
    for (const x of zoom?.comments ?? []) c[x.kind]++
    return c
  }, [zoom])

  const copy = (k: string, v: string) => {
    void navigator.clipboard.writeText(v)
    setCopied(k)
    window.setTimeout(() => setCopied(''), 1500)
  }

  async function fetchNow() {
    setBusy(true)
    setMsg({})
    try {
      const r = await pullZoom(date.id)
      setMsg({ ok: `From Zoom: ${r.attendees} attended · ${r.questions} questions · ${r.polls ?? 0} poll answers · ${r.chat} chat messages${r.notes?.length ? ` (${r.notes.join(' · ')})` : ''}` })
      load()
    } catch (e) {
      setMsg({ error: (e as Error).message })
    }
    setBusy(false)
  }

  return (
    <Drawer
      open
      width={760}
      onClose={onClose}
      title={`${date.title} · ${fmtDay(date.event_date)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <div className="foot-end">
            {webinar && (
              <Button
                variant="ghost"
                className="danger-text"
                onClick={() => {
                  setScope(oneDate ? 'all' : 'date')
                  if (!oneDate && !started && active.length) setDeleting(true)
                  else setRemoving(true)
                }}
              >
                <Trash2 size={14} /> Delete
              </Button>
            )}
            {webinar && canEdit && !started && (
              <Button variant="outline" onClick={() => setRescheduling(true)}>
                <CalendarClock size={14} /> Reschedule
              </Button>
            )}
            {webinar && (
              <Button variant="outline" onClick={onEdit}>
                <Pencil size={14} /> Edit webinar
              </Button>
            )}
          </div>
        </>
      }
    >
      <div className="stack">
        {msg.error && <div className="alert alert-error small">{msg.error}</div>}
        {msg.ok && <div className="alert alert-success small">{msg.ok}</div>}
        <FormSection title="Zoom webinar">
          <dl className="info-grid">
            <div>
              <dt>When</dt>
              <dd>
                {fmtDay(date.event_date)}, {clock(date.start_time)} – {clock(date.end_time)}
              </dd>
            </div>
            <div>
              <dt>Zoom webinar ID</dt>
              <dd>{date.zoom_webinar_id ?? <span className="muted">{date.zoom_error ? 'Not made' : 'Being made…'}</span>}</dd>
            </div>
            {date.zoom_password && (
              <div>
                <dt>Passcode</dt>
                <dd>{date.zoom_password}</dd>
              </div>
            )}
            <div>
              <dt>Zoom data</dt>
              <dd>{date.zoom_pulled_at ? `Fetched ${at(date.zoom_pulled_at)}` : ended ? 'Not fetched yet (5 minutes after the end)' : 'After it ends'}</dd>
            </div>
            {webinar?.slug && (
              <div className="info-full">
                <dt>Join link</dt>
                <dd>
                  <div className="wb-link">
                    <a className="wb-link-url" href={joinLink(webinar.slug)} target="_blank" rel="noreferrer">
                      {joinLink(webinar.slug)}
                    </a>
                    <button type="button" className="btn btn-ghost btn-icon btn-sm" title="Copy link" onClick={() => copy('link', joinLink(webinar.slug!))}>
                      {copied === 'link' ? <Check size={15} /> : <Copy size={15} />}
                    </button>
                  </div>
                  <div className="muted small" style={{ marginTop: 4 }}>The same link for every date: it opens the Zoom meeting of the date that’s on now, else the next one.</div>
                </dd>
              </div>
            )}
          </dl>
          {date.zoom_error && <div className="alert alert-error small">Zoom: {date.zoom_error}</div>}
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {date.zoom_start_url && (
              <a className="btn btn-primary btn-sm" href={date.zoom_start_url} target="_blank" rel="noreferrer">
                Start as host
              </a>
            )}
            {ended && date.zoom_webinar_id && (
              <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void fetchNow()}>
                <RefreshCw size={14} className={busy ? 'spin' : undefined} /> {busy ? 'Fetching…' : 'Fetch Zoom data now'}
              </button>
            )}
          </div>
        </FormSection>

        <FormSection title={`Registered (${regs?.length ?? 0})`} description={ended ? `${zoom?.attendance.length ?? 0} attended · ${counts.qa} questions · ${counts.chat} chat · ${counts.poll} poll answers` : 'Leads registered for this date by the workflow, each with their own joining link.'}>
          {!regs ? (
            <div className="muted small">Loading…</div>
          ) : !regs.length ? (
            <Empty>No one registered for this date yet.</Empty>
          ) : (
            <Paged rows={regs}>
              {(paged) => (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Lead</th>
                        <th>Registered on</th>
                        <th>Attended</th>
                        <th>Category</th>
                        <th>Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paged.map((r) => {
                        const a = attByLead.get(r.lead_id)
                        const cat = categoryLook(r.category, r.category_name)
                        return (
                          <tr key={r.id}>
                            <td>
                              <Link to={`/leads/${r.lead_id}`} className="link-btn">
                                {leadName(r)}
                              </Link>
                              <div className="muted small">{r.leads?.phone}</div>
                              {r.moved_to_date && <span className="badge badge-muted">Moved to {fmtDay(r.moved_to_date)}</span>}
                            </td>
                            <td className="nowrap">{at(r.created_at)}</td>
                            <td className="nowrap">{a ? `${a.minutes ?? 0} min · from ${at(a.join_time)}` : ended ? <span className="muted">Didn’t join</span> : '—'}</td>
                            <td>
                              {cat ? (
                                <span className="stage-pill" style={{ ['--c' as string]: cat.color }}>
                                  {cat.label}
                                </span>
                              ) : (
                                <span className="muted">—</span>
                              )}
                            </td>
                            <td>
                              {(r.short_link || r.join_url) && (
                                <button type="button" className="btn btn-ghost btn-sm" title={r.short_link || r.join_url || ''} onClick={() => copy(r.id, r.short_link || r.join_url || '')}>
                                  <Copy size={14} /> {copied === r.id ? 'Copied' : 'Copy'}
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Paged>
          )}
        </FormSection>

        {(zoom?.comments.length ?? 0) > 0 && (
          <FormSection title="Q&A, chat and polls">
            <div className="stack" style={{ gap: 6 }}>
              {zoom!.comments.slice(0, 300).map((c, i) => (
                <div key={i} className="small">
                  <span className="badge badge-muted">{c.kind === 'qa' ? 'Q&A' : c.kind === 'poll' ? 'Poll' : 'Chat'}</span> <b>{c.name ?? c.email ?? 'Someone'}</b>: {c.body}
                  {c.answer && <span className="muted"> → {c.answer}</span>}
                </div>
              ))}
            </div>
          </FormSection>
        )}
      </div>
      {webinar && rescheduling && (
        <RescheduleDrawer
          webinar={webinar}
          from={{ date: date.event_date, start: date.start_time, end: date.end_time ?? date.start_time }}
          madeDates={siblings.map((d) => d.event_date)}
          registered={active.length}
          onClose={() => setRescheduling(false)}
          onDone={onDeleted}
        />
      )}
      {webinar && deleting && (
        <DeleteDateDrawer
          date={date}
          webinar={webinar}
          siblings={siblings}
          registered={active.length}
          memberId={membership?.id}
          onClose={() => setDeleting(false)}
          onDeleted={onDeleted}
        />
      )}
      {webinar && (
        <ConfirmModal
          open={removing}
          icon={Trash2}
          danger
          busy={busy}
          title="Delete webinar?"
          message={
            oneDate ? (
              <>“{webinar.title}” is deleted, with its 3 workflows and its funnel. Registrations and Zoom data stay on the leads.</>
            ) : (
              <span style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', gap: 10 }}>
                <label className="radio-row">
                  <input type="radio" checked={scope === 'date'} onChange={() => setScope('date')} />
                  <span>
                    <b>Only this date</b> ({fmtDay(date.event_date)}): removed from Zoom; the webinar’s next date follows.
                  </span>
                </label>
                <label className="radio-row">
                  <input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} />
                  <span>
                    <b>The whole webinar</b>: all its coming dates, its 3 workflows and its funnel.
                  </span>
                </label>
                <span className="muted small">Registrations and Zoom data stay on the leads.</span>
              </span>
            )
          }
          confirmLabel="Delete"
          onCancel={() => setRemoving(false)}
          onConfirm={async () => {
            setBusy(true)
            try {
              if (scope === 'date') {
                await deleteWebinarDate(date)
                onDeleted(`${webinar.title} · ${fmtDay(date.event_date)} deleted.`)
              } else {
                await archiveWebinar(webinar)
                onDeleted(`${webinar.title} deleted.`)
              }
            } catch (e) {
              setRemoving(false)
              setMsg({ error: (e as Error).message })
            }
            setBusy(false)
          }}
        />
      )}
    </Drawer>
  )
}

/**
 * Delete a date that has registered leads: only this date (its leads moved to the next date, or left on it, with an
 * optional WhatsApp to them first) or the whole webinar.
 */
function DeleteDateDrawer({
  date,
  webinar,
  siblings,
  registered,
  memberId,
  onClose,
  onDeleted,
}: {
  date: WebinarDate
  webinar: WebinarRow
  siblings: WebinarDate[]
  registered: number
  memberId?: string
  onClose: () => void
  onDeleted: (msg: string) => void
}) {
  const [scope, setScope] = useState<'date' | 'all'>('date')
  const [move, setMove] = useState(true)
  const [send, setSend] = useState(false)
  const [notice, setNotice] = useState<NoticeDraft>(EMPTY_NOTICE)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // the next date (made, else scheduled) and its time
  const made = siblings.filter((d) => d.id !== date.id)
  const { next } = dateNeighbours(webinar, siblings.map((d) => d.event_date), date.event_date, todayIst())
  const nextMade = next ? made.find((d) => d.event_date === next) : null
  const nextSlot = next && !nextMade ? plannedSlots(webinar, siblings.map((d) => d.event_date), todayIst()).find((x) => x.date === next) : null
  const nextText = next ? `${fmtDay(next)}, ${clock(nextMade ? nextMade.start_time : nextSlot?.start ?? webinar.start_time)}` : ''
  const moving = scope === 'date' && !!next && move
  const plural = registered === 1 ? '' : 's'

  function submit() {
    if (scope === 'date' && send) {
      const n = noticeOf(notice)
      if (typeof n === 'string') return setError(n)
    }
    setError(null)
    setConfirming(true)
  }
  async function run() {
    setBusy(true)
    try {
      if (scope === 'all') {
        await archiveWebinar(webinar)
        onDeleted(`${webinar.title} deleted.`)
        return
      }
      const n = send ? noticeOf(notice) : null
      const r = await deleteWebinarDate(date, { move: moving, notice: typeof n === 'string' ? null : n, memberId })
      onDeleted(
        `${webinar.title} · ${fmtDay(date.event_date)} deleted.${r.moved ? ` ${r.moved} lead${r.moved === 1 ? '' : 's'} moved to ${r.next_date ? fmtDay(r.next_date) : 'the next date'}: the registration workflow registers them there.` : ''}${r.messages ? ` Sending the message to ${r.messages}.` : ''}`,
      )
    } catch (e) {
      setConfirming(false)
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Drawer
      open
      width={600}
      onClose={onClose}
      title={`Delete · ${webinar.title} · ${fmtDay(date.event_date)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button variant="danger" onClick={submit} disabled={busy}>
              <Trash2 size={14} /> Delete
            </Button>
          </div>
        </>
      }
    >
      <div className="stack">
        <FormSection title="What to delete">
          <label className="radio-row">
            <input type="radio" checked={scope === 'date'} onChange={() => setScope('date')} />
            <span>
              <b>Only this date</b> ({fmtDay(date.event_date)}): removed from Zoom; the webinar’s next date follows.
            </span>
          </label>
          <label className="radio-row">
            <input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} />
            <span>
              <b>The whole webinar</b>: all its coming dates, its 3 workflows and its funnel. Registrations and Zoom data stay on the leads.
            </span>
          </label>
        </FormSection>

        {scope === 'date' && (
          <FormSection title={`${registered} lead${plural} registered for this date`}>
            {next ? (
              <>
                <label className="radio-row">
                  <input type="radio" checked={move} onChange={() => setMove(true)} />
                  <span>
                    <b>Move them to the next webinar</b> ({nextText}): the registration workflow registers each one there — new joining links, its confirmation and reminders.
                  </span>
                </label>
                <label className="radio-row">
                  <input type="radio" checked={!move} onChange={() => setMove(false)} />
                  <span>
                    <b>Don’t move them</b>: their registrations stay on this deleted date.
                  </span>
                </label>
              </>
            ) : (
              <Hint>The webinar has no next date, so they can’t be moved: their registrations stay on this deleted date.</Hint>
            )}
            <label className={cn('tgl', send && 'is-on')}>
              <input type="checkbox" role="switch" checked={send} onChange={() => setSend(!send)} aria-label="Send a cancel message" />
              <span className="tgl-track" aria-hidden="true">
                <span className="tgl-knob" />
              </span>
              Send a WhatsApp to the {registered} lead{plural} (e.g. this date is cancelled{moving ? `, see you on ${nextText}` : ''})
            </label>
            {send && <NoticeFields kind="cancel" value={notice} onChange={setNotice} />}
          </FormSection>
        )}
      </div>

      <ConfirmModal
        open={confirming}
        icon={Trash2}
        danger
        busy={busy}
        title={scope === 'all' ? 'Delete webinar?' : `Delete ${fmtDay(date.event_date)}?`}
        message={
          scope === 'all'
            ? `“${webinar.title}” is deleted, with all its coming dates, its 3 workflows and its funnel.`
            : `${fmtDay(date.event_date)} is removed from Zoom and its reminders stop.${send ? ` The message goes to the ${registered} lead${plural}.` : ''}${moving ? ` Then they’re registered for ${nextText}.` : ''}`
        }
        confirmLabel={busy ? 'Deleting…' : 'Delete'}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void run()}
      />
    </Drawer>
  )
}
