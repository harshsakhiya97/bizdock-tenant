import { useCallback, useEffect, useState } from 'react'
import { CircleAlert, RefreshCw, Video } from 'lucide-react'
import { Link } from 'react-router'
import { Tabs } from '@/components/ui'
import { listZoomData, pullZoom, retryZoom, type ZoomAttendee, type ZoomComment, type ZoomTarget } from './api'

const time = (s: string | null) => (s ? new Date(s).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '—')
const when = (s: string | null) => (s ? new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '')

/**
 * The Zoom side of a meeting / calendar event: its Zoom meeting (join / start links, or the error with a retry),
 * then — once it has ended — who attended, the Q&A and the chat. Pulled in automatically 30 minutes after
 * the end (and again after 4 hours for the recording's chat); "Fetch now" pulls straight away.
 */
export function ZoomPanel({
  target,
  zoomId,
  joinUrl,
  startUrl,
  password,
  error,
  pulledAt,
  accountName,
  onChanged,
}: {
  target: ZoomTarget
  zoomId: string | null
  joinUrl: string | null
  startUrl: string | null
  password: string | null
  error: string | null
  pulledAt: string | null
  accountName?: string
  onChanged?: () => void
}) {
  const [data, setData] = useState<{ attendees: ZoomAttendee[]; comments: ZoomComment[] } | null>(null)
  const [tab, setTab] = useState('Attendance')
  const [busy, setBusy] = useState<'pull' | 'retry' | null>(null)
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({})

  const { kind, id } = target
  const load = useCallback(() => {
    listZoomData({ kind, id }).then(setData, (e: Error) => setMsg({ error: e.message }))
  }, [kind, id])
  useEffect(load, [load])

  async function pull() {
    setBusy('pull')
    setMsg({})
    try {
      const r = await pullZoom(target)
      setMsg({
        ok: `${r.attendees} attended · ${r.questions} questions · ${r.chat_found ? `${r.chat} chat messages` : 'no chat yet (needs the cloud recording)'}${r.notes.length ? ` · ${r.notes.join(' · ')}` : ''}`,
      })
      load()
      onChanged?.()
    } catch (e) {
      setMsg({ error: (e as Error).message })
    }
    setBusy(null)
  }
  async function retry() {
    setBusy('retry')
    setMsg({})
    try {
      await retryZoom(target)
      setMsg({ ok: 'Zoom meeting created.' })
      onChanged?.()
    } catch (e) {
      setMsg({ error: (e as Error).message })
    }
    setBusy(null)
  }

  const qa = data?.comments.filter((c) => c.kind === 'qa') ?? []
  const chat = data?.comments.filter((c) => c.kind === 'chat') ?? []

  return (
    <div className="zp">
      <div className="zp-head">
        <Video size={16} />
        {zoomId ? (
          <span>
            Zoom {target.kind === 'event' ? '' : 'meeting '}
            <b>{zoomId.replace(/(\d{3})(\d{4})(\d+)/, '$1 $2 $3')}</b>
            {password ? <span className="muted"> · passcode {password}</span> : null}
            {accountName ? <span className="muted"> · {accountName}</span> : null}
          </span>
        ) : error ? (
          <span>Zoom meeting not created</span>
        ) : (
          <span className="muted">Creating the Zoom meeting… (reopen in a moment)</span>
        )}
        <div className="zp-actions">
          {joinUrl?.startsWith('http') && (
            <a className="btn btn-outline btn-sm" href={joinUrl} target="_blank" rel="noreferrer">
              Join
            </a>
          )}
          {startUrl?.startsWith('http') && (
            <a className="btn btn-outline btn-sm" href={startUrl} target="_blank" rel="noreferrer" title="Opens Zoom as the host">
              Start as host
            </a>
          )}
          {!zoomId && error && (
            <button type="button" className="btn btn-outline btn-sm" disabled={!!busy} onClick={() => void retry()}>
              <RefreshCw size={14} /> {busy === 'retry' ? 'Trying…' : 'Try again'}
            </button>
          )}
          {zoomId && (
            <button type="button" className="btn btn-outline btn-sm" disabled={!!busy} onClick={() => void pull()}>
              <RefreshCw size={14} /> {busy === 'pull' ? 'Fetching…' : 'Fetch attendance'}
            </button>
          )}
        </div>
      </div>
      {error && (
        <div className="int-err">
          <CircleAlert size={14} /> {error}
        </div>
      )}
      {msg.error && <div className="alert alert-error small">{msg.error}</div>}
      {msg.ok && <div className="alert alert-info small">{msg.ok}</div>}

      {zoomId && (
        <>
          <div className="muted small">
            {pulledAt ? `Last fetched ${when(pulledAt)}.` : 'Attendance, Q&A and chat come in 30 minutes after it ends (chat again after 4 hours).'}
          </div>
          <Tabs
            tabs={['Attendance', 'Q&A', 'Chat']}
            value={tab}
            onChange={setTab}
            count={tab === 'Attendance' ? data?.attendees.length : tab === 'Q&A' ? qa.length : chat.length}
          />
          {!data ? (
            <div className="muted small">Loading…</div>
          ) : tab === 'Attendance' ? (
            data.attendees.length ? (
              <table className="table table-compact zp-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Joined</th>
                    <th>Left</th>
                    <th style={{ textAlign: 'right' }}>Minutes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.attendees.map((a) => (
                    <tr key={a.id}>
                      <td>
                        {a.lead_id ? <Link to={`/leads/${a.lead_id}`}>{a.name || a.email}</Link> : a.name || a.email || '—'}
                        {a.email && <div className="muted small">{a.email}</div>}
                      </td>
                      <td className="nowrap">{time(a.join_time)}</td>
                      <td className="nowrap">{time(a.leave_time)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {a.minutes}
                        {a.sessions > 1 && <div className="muted small">{a.sessions} joins</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="muted small">No attendance yet.</div>
            )
          ) : (
            <Comments list={tab === 'Q&A' ? qa : chat} empty={tab === 'Q&A' ? 'No questions.' : 'No chat yet. Chat comes from the cloud recording.'} />
          )}
        </>
      )}
    </div>
  )
}

function Comments({ list, empty }: { list: ZoomComment[]; empty: string }) {
  if (!list.length) return <div className="muted small">{empty}</div>
  return (
    <ul className="zp-comments">
      {list.map((c) => (
        <li key={c.id}>
          <div className="zp-who">
            {c.lead_id ? <Link to={`/leads/${c.lead_id}`}>{c.name || c.email || 'Someone'}</Link> : <b>{c.name || c.email || 'Someone'}</b>}
            {c.said_at && <span className="muted small"> · {time(c.said_at)}</span>}
          </div>
          <div className="zp-body">{c.body}</div>
          {c.answer && <div className="zp-answer">↳ {c.answer}</div>}
        </li>
      ))}
    </ul>
  )
}
