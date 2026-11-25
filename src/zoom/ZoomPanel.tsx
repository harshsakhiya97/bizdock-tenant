import { useCallback, useEffect, useState } from 'react'
import { Check, CircleAlert, Copy, RefreshCw, Video } from 'lucide-react'
import { Link } from 'react-router'
import { Tabs, Paged } from '@/components/ui'
import { db } from '@/lib/supabase'
import { listZoomData, pullZoom, retryZoom, type ZoomAttendee, type ZoomComment, type ZoomTarget } from './api'
import { RecordingPanel } from './RecordingPanel'

const time = (s: string | null) => (s ? new Date(s).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '—')
const when = (s: string | null) => (s ? new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '')

/**
 * The Zoom side of a meeting / calendar event: its Zoom meeting (join / start links, or the error with a retry),
 * then — once it has ended — who attended, the Q&A and the chat. Pulled in automatically 5 minutes after
 * the end (and again after 4 hours for the recording's chat); "Fetch now" pulls straight away.
 */
export function ZoomPanel(props: {
  target: ZoomTarget
  zoomId: string | null
  joinUrl: string | null
  startUrl: string | null
  password: string | null
  error: string | null
  pulledAt: string | null
  accountName?: string
  /** for Copy invite: the meeting's name, day (YYYY-MM-DD) and start time (HH:MM, India time) */
  topic?: string
  day?: string | null
  time?: string | null
  onChanged?: () => void
}) {
  // just saved: the Zoom meeting is made on the server in a few seconds; look for it every 3 seconds (up to a minute)
  const [fresh, setFresh] = useState<Partial<{ zoomId: string | null; joinUrl: string | null; startUrl: string | null; password: string | null; error: string | null }>>({})
  const waiting = !(fresh.zoomId ?? props.zoomId) && !(fresh.error ?? props.error)
  const { kind: tk, id: tid } = props.target
  useEffect(() => {
    if (!waiting) return
    let n = 0
    const t = window.setInterval(async () => {
      if (++n > 20) return window.clearInterval(t)
      const { data } =
        tk === 'meeting'
          ? await db().from('meetings').select('zoom_meeting_id, link, zoom_start_url, zoom_password, zoom_error').eq('id', tid).maybeSingle()
          : await db().from('events').select('zoom_webinar_id, meeting_link, zoom_start_url, zoom_password, zoom_error').eq('id', tid).maybeSingle()
      const r = (data ?? {}) as Record<string, string | null>
      const zid = r.zoom_meeting_id ?? r.zoom_webinar_id ?? null
      if (zid || r.zoom_error) {
        setFresh({ zoomId: zid, joinUrl: r.link ?? r.meeting_link ?? null, startUrl: r.zoom_start_url, password: r.zoom_password, error: r.zoom_error })
        window.clearInterval(t)
      }
    }, 3000)
    return () => window.clearInterval(t)
  }, [waiting, tk, tid])
  return (
    <ZoomPanelInner
      {...props}
      zoomId={fresh.zoomId ?? props.zoomId}
      joinUrl={fresh.joinUrl ?? props.joinUrl}
      startUrl={fresh.startUrl ?? props.startUrl}
      password={fresh.password ?? props.password}
      error={fresh.error ?? props.error}
    />
  )
}

function ZoomPanelInner({
  target,
  zoomId,
  joinUrl,
  startUrl,
  password,
  error,
  pulledAt,
  accountName,
  topic,
  day: inviteDay,
  time: inviteTime,
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
  topic?: string
  day?: string | null
  time?: string | null
  onChanged?: () => void
}) {
  const [data, setData] = useState<{ attendees: ZoomAttendee[]; comments: ZoomComment[] } | null>(null)
  const [tab, setTab] = useState('Attendance')
  const [busy, setBusy] = useState<'pull' | 'retry' | null>(null)
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({})
  const [recCount, setRecCount] = useState<number | undefined>(undefined)
  const [recKey, setRecKey] = useState(0)

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
        ok: `${r.attendees} attended · ${r.questions} questions · ${r.chat_found ? `${r.chat} chat messages` : 'no chat yet (needs the cloud recording)'}${r.recording ? ' · recording found' : ''}${r.notes.length ? ` · ${r.notes.join(' · ')}` : ''}`,
      })
      load()
      setRecKey((k) => k + 1)
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
  // Copy link / Copy invite (the invitation as Zoom words it)
  const [copied, setCopied] = useState<'' | 'link' | 'invite'>('')
  const copy = (what: 'link' | 'invite', text: string) =>
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(what)
      window.setTimeout(() => setCopied(''), 1500)
    })
  const invite = () => {
    const when =
      inviteDay &&
      `${new Date(`${inviteDay.slice(0, 10)}T${(inviteTime ?? '00:00').slice(0, 5)}:00+05:30`).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        ...(inviteTime ? { hour: 'numeric', minute: '2-digit' } : {}),
      })}${inviteTime ? ' India' : ''}`
    return [
      `${accountName || 'You are'} ${accountName ? 'is inviting you' : 'invited'} to a scheduled Zoom ${target.kind === 'event' ? 'webinar' : 'meeting'}.`,
      '',
      topic ? `Topic: ${topic}` : '',
      when ? `Time: ${when}` : '',
      '',
      `Join Zoom ${target.kind === 'event' ? 'Webinar' : 'Meeting'}`,
      joinUrl ?? '',
      '',
      zoomId ? `Meeting ID: ${zoomId.replace(/(\d{3})(\d{4})(\d+)/, '$1 $2 $3')}` : '',
      password ? `Passcode: ${password}` : '',
    ]
      .filter((x, i, all) => x !== '' || (all[i - 1] !== '' && i > 0))
      .join('\n')
      .trim()
  }

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
          <span className="muted">Creating the Zoom meeting…</span>
        )}
        <div className="zp-actions">
          {joinUrl?.startsWith('http') && (
            <a className="btn btn-outline btn-sm" href={joinUrl} target="_blank" rel="noreferrer">
              Join
            </a>
          )}
          {joinUrl?.startsWith('http') && (
            <>
              <button type="button" className="btn btn-outline btn-sm" title="Copy the join link" onClick={() => copy('link', joinUrl)}>
                {copied === 'link' ? <Check size={14} /> : <Copy size={14} />} {copied === 'link' ? 'Copied' : 'Copy link'}
              </button>
              <button type="button" className="btn btn-outline btn-sm" title="Copy the invitation: topic, time, link, meeting ID and passcode" onClick={() => copy('invite', invite())}>
                {copied === 'invite' ? <Check size={14} /> : <Copy size={14} />} {copied === 'invite' ? 'Copied' : 'Copy invite'}
              </button>
            </>
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
            {pulledAt ? `Last fetched ${when(pulledAt)}.` : 'Attendance and Q&A come in 5 minutes after it ends (tried again every 5 minutes if Zoom isn’t ready); chat after 4 hours.'}
          </div>
          <Tabs
            tabs={['Attendance', 'Q&A', 'Chat', 'Recording']}
            value={tab}
            onChange={setTab}
            count={tab === 'Attendance' ? data?.attendees.length : tab === 'Q&A' ? qa.length : tab === 'Chat' ? chat.length : recCount}
          />
          {tab === 'Recording' ? (
            <RecordingPanel key={recKey} target={target} onCount={setRecCount} />
          ) : !data ? (
            <div className="muted small">Loading…</div>
          ) : tab === 'Attendance' ? (
            data.attendees.length ? (
              <Paged rows={data.attendees}>
{(paged) => (
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
                  {paged.map((a) => (
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
)}
</Paged>
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
