import { useEffect, useState } from 'react'
import { FileText, RefreshCw } from 'lucide-react'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { db } from '@/lib/supabase'

export type TranscriptStatus = 'waiting' | 'done' | 'error' | 'skipped' | null

/** a call's transcript cell (Callyzer lists): View when it's written, else what's happening */
export function TranscriptCell({ call }: { call: { id: string; recording_path: string | null; recording_url?: string | null; duration_sec: number | null; transcript_status?: TranscriptStatus; title?: string } }) {
  const [open, setOpen] = useState(false)
  if (!call.recording_path && !call.recording_url) return <span className="muted">—</span>
  const st = call.transcript_status
  const label = st === 'done' ? 'View' : st === 'error' ? 'Failed' : !call.recording_path ? 'After copy' : (call.duration_sec ?? 0) < 5 ? 'Too short' : 'Writing…'
  return (
    <>
      <button
        type="button"
        className={st === 'done' ? 'link-btn' : 'link-btn muted'}
        title={st === 'done' ? 'Open the transcript' : 'Transcripts are written by Gemini AI after the recording is copied; open to write it now'}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        {st === 'done' && <FileText size={13} />} {label}
      </button>
      {open && <TranscriptDrawer call={call} onClose={() => setOpen(false)} />}
    </>
  )
}

/** the transcript, the recording and Regenerate */
function TranscriptDrawer({ call, onClose }: { call: { id: string; recording_path: string | null; recording_url?: string | null; title?: string }; onClose: () => void }) {
  const [row, setRow] = useState<{ transcript: string | null; transcript_status: TranscriptStatus; transcript_error: string | null; transcript_at: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // the recording: our copy (a 1-hour link), else Callyzer's link until it's copied
  const [audio, setAudio] = useState<string | null>(null)
  useEffect(() => {
    if (!call.recording_path) return setAudio(call.recording_url ?? null)
    db()
      .storage.from('call-recordings')
      .createSignedUrl(call.recording_path, 3600)
      .then(({ data }) => setAudio(data?.signedUrl ?? call.recording_url ?? null))
  }, [call.recording_path, call.recording_url])
  useEffect(() => {
    db()
      .from('calls')
      .select('transcript, transcript_status, transcript_error, transcript_at')
      .eq('id', call.id)
      .maybeSingle()
      .then(({ data, error: e }) => (e ? setError(e.message) : setRow(data as typeof row)))
  }, [call.id])

  async function regenerate() {
    setBusy(true)
    setError(null)
    const { data, error: e } = await db().functions.invoke('call-transcribe', { body: { action: 'redo', id: call.id } })
    let why = data?.error ?? null
    if (!why && e) {
      const ctx = (e as { context?: Response }).context
      const p = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null
      why = p?.error ?? (e.name === 'FunctionsFetchError' ? 'The transcript service isn’t reachable (not deployed yet?).' : e.message)
    }
    if (why) setError(String(why))
    else setRow({ transcript: data.transcript || '(no conversation)', transcript_status: 'done', transcript_error: null, transcript_at: new Date().toISOString() })
    setBusy(false)
  }

  const done = row?.transcript_status === 'done' && row.transcript
  return (
    <Drawer
      open
      onClose={onClose}
      width={620}
      title={call.title ? `Transcript · ${call.title}` : 'Call transcript'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button onClick={() => void regenerate()} disabled={busy || !call.recording_path}>
              <RefreshCw size={14} /> {busy ? 'Writing…' : done ? 'Regenerate' : 'Write transcript'}
            </Button>
          </div>
        </>
      }
    >
      <div className="stack">
        {audio ? <audio className="rec-player" src={audio} controls preload="metadata" /> : <div className="muted small">Loading the recording…</div>}
        {!row ? (
          <div className="muted small">Loading…</div>
        ) : done ? (
          <>
            <TranscriptChat text={row.transcript ?? ''} />
            {row.transcript_at && <div className="muted small">Written by Gemini AI on {new Date(row.transcript_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}.</div>}
          </>
        ) : (
          <div className="muted small">
            {!call.recording_path
              ? 'The recording isn’t copied into BizDock yet; the transcript is written after that.'
              : row.transcript_status === 'error'
                ? `Couldn’t write it: ${row.transcript_error ?? 'unknown error'}. Press Write transcript to try again.`
                : row.transcript_error
                  ? `Waiting: ${row.transcript_error}`
                  : 'Not written yet: transcripts are written by Gemini AI a few minutes after the recording is copied (newest calls first). Press Write transcript to do it now.'}
          </div>
        )}
      </div>
    </Drawer>
  )
}

/** the turns of a transcript: "Team: …" / "Customer: …" (one per line, or run together on one line) */
function turns(text: string) {
  const parts = text
    .replace(/\r/g, '')
    .split(/\n+|(?=\b(?:Team|Customer)\s*(?:\([^)]*\))?\s*:)/)
    .map((x) => x.trim())
    .filter(Boolean)
  return parts.map((p) => {
    const m = /^(\[?[\d:]+\]?\s*)?([A-Za-z][\w .'()-]{0,30}?)\s*:\s*([\s\S]*)$/.exec(p)
    if (!m) return { who: '', side: 'note' as const, text: p }
    const who = m[2].trim()
    const side = /^team\b/i.test(who) ? ('right' as const) : ('left' as const)
    return { who, side, text: m[3].trim() }
  })
}

/** a call transcript as a chat: the team on the right, the customer on the left */
function TranscriptChat({ text }: { text: string }) {
  const list = turns(text)
  return (
    <div className="tc-chat">
      {list.map((t, i) =>
        t.side === 'note' ? (
          <div key={i} className="tc-note">
            {t.text}
          </div>
        ) : (
          <div key={i} className={`wa-msg ${t.side === 'right' ? 'is-out' : 'is-in'}`}>
            <div className="wa-msg-tpl">{t.who}</div>
            <div className="wa-msg-text">{t.text}</div>
          </div>
        ),
      )}
    </div>
  )
}
