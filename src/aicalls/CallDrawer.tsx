import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { RefreshCw } from 'lucide-react'
import { Drawer } from '@/components/Drawer'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { hasDevanagari, toHinglish } from '@/lib/hinglish'
import { fieldLabel, hx, resultOf, rupees, secs, type AiCall } from './api'

type Turn = { at?: string; speaker?: string; text?: string }

/** one AI call: result, recording, summary, the answers it collected and the conversation (fresh from HelloRix) */
export function CallDrawer({ call: initial, memberName, onClose, onChanged }: { call: AiCall; memberName?: (id: string | null) => string | undefined; onClose: () => void; onChanged?: (c: AiCall) => void }) {
  const tenant = useTenant()
  const [call, setCall] = useState(initial)
  const [turns, setTurns] = useState<Turn[] | null>(null)
  const [busy, setBusy] = useState(false)
  // the conversation in Hindi letters, or Hinglish (English letters): the call itself stays Hindi
  const [hinglish, setHinglish] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const load = () => {
    setBusy(true)
    hx<{ call: AiCall; transcript: Turn[] }>(tenant.id, { action: 'detail', id: initial.id }).then(
      (d) => {
        setCall(d.call)
        setTurns(d.transcript ?? [])
        setBusy(false)
        setError(null)
        onChanged?.(d.call)
      },
      (e: Error) => {
        setTurns([])
        setBusy(false)
        setError(e.message)
      },
    )
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [initial.id])
  // still running: look again every 10 seconds
  useEffect(() => {
    if (call.final) return
    const t = window.setInterval(load, 10_000)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.final])

  const r = resultOf(call)
  const answers = Object.entries(call.collected ?? {}).filter(([, v]) => v !== null && v !== '' && v !== undefined)
  const when = new Date(call.placed_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  return (
    <Drawer open onClose={onClose} width={620} title={call.to_name || call.to_phone}>
      <div className="stack">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className={cn('badge', r.tone)}>{r.label}</span>
          <span className="muted small">
            {call.to_phone} · {when} · talk {secs(call.talk_seconds)} · {rupees(call.cost)}
            {!call.cost_final && call.final ? ' (being priced)' : ''}
            {call.hangup_party ? ` · ended by ${call.hangup_party === 'agent' ? 'the AI' : call.hangup_party}` : ''}
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={load} disabled={busy} style={{ marginLeft: 'auto' }}>
            <RefreshCw size={14} className={busy ? 'spin' : undefined} /> Refresh
          </button>
        </div>
        <div className="muted small">
          {call.objective_name ? `Template: ${call.objective_name}` : ''}
          {call.via === 'workflow' ? ' · from a workflow' : call.member_id && memberName?.(call.member_id) ? ` · by ${memberName(call.member_id)}` : ''}
          {call.lead_id && (
            <>
              {' · '}
              <Link to={`/leads/${call.lead_id}`} className="link-btn">
                Open lead
              </Link>
            </>
          )}
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        {call.error && <div className="alert alert-error">{call.error}</div>}

        {call.recording_url && (
          <div>
            <div className="ac-label">Recording</div>
            <audio controls src={call.recording_url} style={{ width: '100%' }} />
          </div>
        )}
        <div>
          <div className="ac-label">Summary</div>
          <div>{call.summary || <span className="muted">{call.final ? 'No summary.' : 'Comes in a few seconds after the call ends.'}</span>}</div>
        </div>
        {answers.length > 0 && (
          <div>
            <div className="ac-label">What they said</div>
            <dl className="info-grid">
              {answers.map(([k, v]) => (
                <div key={k}>
                  <dt>{fieldLabel(k)}</dt>
                  <dd>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        <div>
          <div className="row-between" style={{ gap: 8, marginBottom: 4 }}>
            <div className="ac-label" style={{ margin: 0 }}>
              Conversation {turns ? `(${turns.length})` : ''}
            </div>
            {turns?.some((t) => hasDevanagari(t.text)) && (
              <div className="seg seg-sm" role="group" aria-label="Script">
                <button type="button" className={hinglish ? 'is-active' : undefined} onClick={() => setHinglish(true)}>
                  Hinglish
                </button>
                <button type="button" className={!hinglish ? 'is-active' : undefined} onClick={() => setHinglish(false)}>
                  Hindi
                </button>
              </div>
            )}
          </div>
          {!turns ? (
            <div className="muted small">Loading…</div>
          ) : !turns.length ? (
            <div className="muted small">No conversation{call.final ? '' : ' yet'}.</div>
          ) : (
            <div className="ac-turns">
              {turns.map((t, i) => (
                <div key={i} className={cn('ac-turn', t.speaker === 'agent' ? 'is-agent' : 'is-them')}>
                  <small>{t.speaker === 'agent' ? 'AI' : call.to_name || 'Them'}</small>
                  <div>{hinglish ? toHinglish(t.text) : t.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Drawer>
  )
}
