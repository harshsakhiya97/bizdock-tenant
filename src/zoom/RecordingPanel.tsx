import { useCallback, useEffect, useState } from 'react'
import { Download, FileAudio, Link2, Plus, RefreshCw, Sparkles, Trash2, Upload } from 'lucide-react'
import { Md } from '@/ai/AiInsights'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Hint, Label, TextInput } from '@/components/Field'
import { ConfirmModal, Tabs } from '@/components/ui'
import { useTenant } from '@/tenant/useTenant'
import { addRecording, listRecordings, recordingUrl, redoRecording, REC_BUCKET, removeRecording, type RecTarget, type Recording } from './recordings'

const when = (s: string | null) => (s ? new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '')
const mb = (n: number | null) => (n ? `${(n / 1_048_576).toFixed(n > 10_485_760 ? 0 : 1)} MB` : '')
const mins = (s: number | null) => (s ? `${Math.round(s / 60)} min` : '')

/**
 * A meeting's / webinar date's recordings: the Zoom cloud recording (copied into our storage a few minutes after it
 * ends), or one added by hand (a file or a link); its player and file path, then the summary and the transcript (AI).
 */
export function RecordingPanel({ target, onCount }: { target: RecTarget; onCount?: (n: number) => void }) {
  const tenant = useTenant()
  const [rows, setRows] = useState<Recording[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<Recording | null>(null)
  const { kind, id } = target
  const load = useCallback(() => {
    listRecordings({ kind, id }).then(
      (r) => {
        setRows(r)
        onCount?.(r.length)
      },
      (e: Error) => setError(e.message),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id])
  useEffect(load, [load])
  // while something is being copied or summarised, look again every 20 seconds
  const working = rows?.some((r) => r.copy_status === 'waiting' || (r.copy_status === 'done' && r.ai_status === 'waiting'))
  useEffect(() => {
    if (!working) return
    const t = window.setInterval(load, 20_000)
    return () => window.clearInterval(t)
  }, [working, load])

  return (
    <div className="stack rec">
      <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span className="muted small">The Zoom cloud recording is copied here about 30 minutes after the meeting ends, then its transcript and summary are written (Gemini AI).</span>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus size={14} /> Add recording
        </Button>
      </div>
      {error && <div className="alert alert-error small">{error}</div>}
      {!rows ? (
        <div className="muted small">Loading…</div>
      ) : !rows.length ? (
        <div className="muted small">No recording yet.</div>
      ) : (
        rows.map((r) => <RecordingCard key={r.id} r={r} onChanged={load} onRemove={() => setRemoving(r)} />)
      )}

      {adding && (
        <AddRecordingDrawer
          onClose={() => setAdding(false)}
          onSave={async (input) => {
            await addRecording(tenant.id, target, input)
            setAdding(false)
            load()
          }}
        />
      )}
      <ConfirmModal
        open={!!removing}
        icon={Trash2}
        danger
        title="Remove this recording?"
        message={removing ? `“${removing.title ?? 'Recording'}” and its summary and transcript are removed from this meeting.` : ''}
        confirmLabel="Remove"
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          const r = removing
          setRemoving(null)
          if (!r) return
          try {
            await removeRecording(r)
            load()
          } catch (e) {
            setError((e as Error).message)
          }
        }}
      />
    </div>
  )
}

function RecordingCard({ r, onChanged, onRemove }: { r: Recording; onChanged: () => void; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [tab, setTab] = useState('Summary')
  const path = r.video_path ?? r.audio_path
  const isVideo = !!r.video_path
  useEffect(() => {
    if (!path) return
    recordingUrl(path).then(setUrl, () => setUrl(null))
  }, [path])

  async function redo(copy = false) {
    setBusy(true)
    setMsg(null)
    try {
      await redoRecording(r.id, copy)
      setMsg('Queued: it runs within a minute.')
      onChanged()
    } catch (e) {
      setMsg((e as Error).message)
    }
    setBusy(false)
  }

  const copying = r.source === 'zoom' && r.copy_status === 'waiting'
  return (
    <article className="rec-card">
      <div className="rec-head">
        <FileAudio size={16} />
        <div className="rec-title">
          <b>{r.title ?? 'Recording'}</b>
          <span className="muted small">
            {[r.source === 'zoom' ? 'Zoom cloud recording' : 'Added by hand', when(r.recorded_at), mins(r.duration_sec)].filter(Boolean).join(' · ')}
          </span>
        </div>
        {r.source === 'manual' && (
          <button type="button" className="btn btn-ghost btn-icon btn-sm danger-text" title="Remove" onClick={onRemove}>
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {copying ? (
        <div className="muted small">Copying the recording from Zoom…</div>
      ) : r.copy_status === 'error' ? (
        <div className="alert alert-error small">
          Couldn’t copy it from Zoom: {r.copy_error}{' '}
          <button type="button" className="link-btn" disabled={busy} onClick={() => void redo(true)}>
            Try again
          </button>
        </div>
      ) : null}

      {path && url && (isVideo ? <video className="rec-player" src={url} controls preload="metadata" /> : <audio className="rec-player" src={url} controls preload="metadata" />)}
      {(path || r.link_url) && (
        <div className="rec-file small">
          {path && (
            <>
              <span className="muted">File:</span> <code>{`${REC_BUCKET}/${path}`}</code> {mb(isVideo ? r.video_size : r.audio_size)}
              {url && (
                <a className="link-btn" href={url} target="_blank" rel="noreferrer" download>
                  <Download size={13} /> Download
                </a>
              )}
              {r.video_path && r.audio_path && <span className="muted"> · audio copy kept too</span>}
            </>
          )}
          {r.link_url && (
            <a href={r.link_url} target="_blank" rel="noreferrer" className="link-btn">
              <Link2 size={13} /> {r.link_url.length > 60 ? `${r.link_url.slice(0, 60)}…` : r.link_url}
            </a>
          )}
        </div>
      )}
      {r.copy_error && r.copy_status === 'done' && <div className="muted small">{r.copy_error}</div>}

      <div className="rec-section">
        <div className="rec-section-head">
          <Tabs tabs={['Summary', 'Transcript']} value={tab} onChange={setTab} />
          {r.copy_status === 'done' && r.ai_status !== 'waiting' && path && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void redo()}>
              {r.ai_status === 'done' ? <RefreshCw size={13} /> : <Sparkles size={13} />} {r.ai_status === 'done' ? 'Write again' : 'Write summary'}
            </button>
          )}
        </div>
        {r.ai_status === 'waiting' && r.copy_status === 'done' ? (
          <div className="muted small">Writing the transcript and summary… (a few minutes)</div>
        ) : tab === 'Summary' ? (
          r.summary ? <Md text={r.summary} /> : <div className="muted small">{r.ai_error || '—'}</div>
        ) : r.transcript ? (
          <pre className="rec-transcript">{r.transcript}</pre>
        ) : (
          <div className="muted small">{r.ai_error || 'No transcript yet.'}</div>
        )}
        {msg && <div className="muted small">{msg}</div>}
      </div>
    </article>
  )
}

function AddRecordingDrawer({ onClose, onSave }: { onClose: () => void; onSave: (i: { title: string; file: File | null; link: string }) => Promise<void> }) {
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function save() {
    setError(null)
    if (!file && !link.trim()) return setError('Choose a file or paste a link.')
    if (link.trim() && !/^https?:\/\//i.test(link.trim())) return setError('The link should start with https://')
    setBusy(true)
    try {
      await onSave({ title, file, link })
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <Drawer
      open
      onClose={onClose}
      width={520}
      title="Add recording"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button onClick={() => void save()} disabled={busy}>
              {busy ? (file ? 'Uploading…' : 'Saving…') : 'Add recording'}
            </Button>
          </div>
        </>
      }
    >
      <div className="stack">
        <div>
          <Label htmlFor="rec-title">Title</Label>
          <TextInput id="rec-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Call recording, phone" />
        </div>
        <div>
          <Label htmlFor="rec-file">Recording file</Label>
          <label className="btn btn-outline btn-sm" htmlFor="rec-file" style={{ width: 'fit-content' }}>
            <Upload size={14} /> {file ? 'Change file' : 'Choose audio or video'}
          </label>
          <input id="rec-file" type="file" accept="audio/*,video/*" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {file && (
            <div className="small" style={{ marginTop: 6 }}>
              {file.name} · {mb(file.size)}
            </div>
          )}
          <Hint>Saved in BizDock’s storage; its transcript and summary are written by Gemini AI within a few minutes.</Hint>
        </div>
        <div>
          <Label htmlFor="rec-link">Or a link</Label>
          <TextInput id="rec-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/…" />
          <Hint>A link is saved as it is (no transcript or summary: upload the file for those).</Hint>
        </div>
      </div>
    </Drawer>
  )
}
