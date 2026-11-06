import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Copy, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { FormSection } from '@/components/Field'
import { ConfirmModal, Empty, Paged } from '@/components/ui'
import { archiveWebinar, CATEGORY_META, deleteWebinarDate, listRegistrations, listZoomData, pullZoom, type Attendance, type Registration, type WebinarDate, type WebinarRow, type ZoomComment } from './api'

const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const clock = (t: string | null) => (t ? new Date(2000, 0, 1, ...(t.slice(0, 5).split(':').map(Number) as [number, number])).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '')
const at = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '—')
const leadName = (r: Registration) => [r.leads?.first_name, r.leads?.last_name].filter(Boolean).join(' ') || 'Lead'

/** One date of a webinar: its Zoom webinar, who registered (and their category after it), attendance, Q&A, chat and polls. */
export function WebinarDateDrawer({
  date,
  webinar,
  onClose,
  onEdit,
  onDeleted,
}: {
  date: WebinarDate
  webinar: WebinarRow | null
  onClose: () => void
  onEdit: () => void
  onDeleted: (msg: string) => void
}) {
  const [regs, setRegs] = useState<Registration[] | null>(null)
  const [zoom, setZoom] = useState<{ attendance: Attendance[]; comments: ZoomComment[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({})
  const [copied, setCopied] = useState('')
  // delete: only this date, or the whole webinar (a one-time webinar has just the one date)
  const [removing, setRemoving] = useState(false)
  const [scope, setScope] = useState<'date' | 'all'>('date')
  const oneDate = !webinar || webinar.repeat === 'once'

  const load = useCallback(() => {
    void listRegistrations({ eventId: date.id }).then(setRegs, () => setRegs([]))
    void listZoomData({ eventId: date.id }).then(setZoom, () => setZoom({ attendance: [], comments: [] }))
  }, [date.id])
  useEffect(load, [load])

  const ended = Date.parse(`${date.event_date}T${(date.end_time ?? date.start_time).slice(0, 5)}:00+05:30`) < Date.now()
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
                  setRemoving(true)
                }}
              >
                <Trash2 size={14} /> Delete
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
          </dl>
          {date.zoom_error && <div className="alert alert-error small">Zoom: {date.zoom_error}</div>}
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {date.zoom_start_url && (
              <a className="btn btn-primary btn-sm" href={date.zoom_start_url} target="_blank" rel="noreferrer">
                Start as host
              </a>
            )}
            {date.meeting_link && (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => copy('link', date.meeting_link!)}>
                <Copy size={14} /> {copied === 'link' ? 'Copied' : 'Copy registration link'}
              </button>
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
                        const cat = r.category ? CATEGORY_META[r.category] : null
                        return (
                          <tr key={r.id}>
                            <td>
                              <Link to={`/leads/${r.lead_id}`} className="link-btn">
                                {leadName(r)}
                              </Link>
                              <div className="muted small">{r.leads?.phone}</div>
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
                await deleteWebinarDate(date, webinar)
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
