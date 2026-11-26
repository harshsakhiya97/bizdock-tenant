import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { FileText, Square, Wand2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { db } from '@/lib/supabase'
import { useTenant } from '@/tenant/useTenant'

type Status = {
  relabel_left: number
  write_left: number
  failed: number
  claude: boolean
  gemini: boolean
  sync: { active: boolean; started_at: string | null; finished_at: string | null; relabel_total: number; write_total: number; note: string | null } | null
}

const when = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '')

/**
 * Callyzer → History logs → Sync transcripts: the transcripts whose speaker labels Claude hasn't checked yet (Claude API) and
 * the calls with no transcript (Gemini); Start runs both in the background (every minute) with live progress here.
 */
export function SyncTranscripts({ onChanged }: { onChanged?: () => void }) {
  const tenant = useTenant()
  const [st, setSt] = useState<Status | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    db()
      .rpc('transcript_sync_status', { p_tenant: tenant.id })
      .then(({ data, error: e }) => (e ? setError(e.message) : setSt(data as Status)))
  }, [tenant.id])
  useEffect(load, [load])
  const active = !!st?.sync?.active
  // while it runs (or the panel is open), look again every 10 seconds
  useEffect(() => {
    if (!active && !open) return
    const t = window.setInterval(() => {
      load()
      if (active) onChanged?.()
    }, 10_000)
    return () => window.clearInterval(t)
  }, [active, open, load, onChanged])

  if (!st) return null
  const pending = (st.claude ? st.relabel_left : 0) + st.write_left

  async function set(on: boolean) {
    setBusy(true)
    setError(null)
    const { error: e } = await db().rpc('transcript_sync_set', { p_tenant: tenant.id, p_on: on })
    if (e) setError(e.message)
    load()
    setBusy(false)
  }

  const s = st.sync
  const fixed = s ? Math.max(0, s.relabel_total - st.relabel_left) : 0
  const written = s ? Math.max(0, s.write_total - st.write_left) : 0
  const pct = (a: number, b: number) => (b ? Math.min(100, Math.round((a / b) * 100)) : 100)

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Wand2 size={15} /> {active ? 'Syncing transcripts…' : `Sync transcripts${pending ? ` (${pending.toLocaleString('en-IN')})` : ''}`}
      </Button>
      {open && (
        <Drawer
          open
          onClose={() => setOpen(false)}
          width={520}
          title="Sync transcripts"
          footer={
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
              <div className="foot-end">
                {error && <p className="err-text">{error}</p>}
                {active ? (
                  <Button variant="outline" onClick={() => void set(false)} disabled={busy}>
                    <Square size={14} /> Stop
                  </Button>
                ) : (
                  <Button onClick={() => void set(true)} disabled={busy || !pending}>
                    <Wand2 size={14} /> {busy ? 'Starting…' : 'Start'}
                  </Button>
                )}
              </div>
            </>
          }
        >
          <div className="stack">
            <p className="muted small" style={{ margin: 0 }}>
              Runs in the background (every minute); you can close this and come back. New calls get their transcript by themselves as they come in.
            </p>

            <div className="sync-row">
              <div className="sync-head">
                <b>Check who said what</b>
                <span className="muted small">Claude API · fixes the Team / Customer labels, same words</span>
              </div>
              {!st.claude ? (
                <div className="small">
                  {st.relabel_left.toLocaleString('en-IN')} transcript{st.relabel_left === 1 ? '' : 's'} to check.{' '}
                  <span className="muted">
                    Connect (or tick) <Link to="/integrations">System Connections → Claude API</Link> to check them.
                  </span>
                </div>
              ) : active && s?.relabel_total ? (
                <Progress done={fixed} total={s.relabel_total} pct={pct(fixed, s.relabel_total)} />
              ) : (
                <div className="small">{st.relabel_left ? `${st.relabel_left.toLocaleString('en-IN')} to check` : 'All checked.'}</div>
              )}
            </div>

            <div className="sync-row">
              <div className="sync-head">
                <b>Write missing transcripts</b>
                <span className="muted small">Gemini AI · calls with a recording but no transcript</span>
              </div>
              {!st.gemini ? (
                <div className="small">
                  {st.write_left.toLocaleString('en-IN')} call{st.write_left === 1 ? '' : 's'} without a transcript.{' '}
                  <span className="muted">
                    Connect <Link to="/integrations">System Connections → Gemini AI</Link> to write them.
                  </span>
                </div>
              ) : active && s?.write_total ? (
                <Progress done={written} total={s.write_total} pct={pct(written, s.write_total)} />
              ) : (
                <div className="small">{st.write_left ? `${st.write_left.toLocaleString('en-IN')} to write` : 'Nothing to write.'}</div>
              )}
              {active && st.gemini && st.write_left > 0 && <div className="muted small">If Gemini’s daily limit is reached, these wait and go on by themselves.</div>}
            </div>

            {st.failed > 0 && (
              <div className="muted small">
                <FileText size={12} /> {st.failed} call{st.failed === 1 ? '' : 's'} couldn’t be transcribed (3 tries): open one and press Regenerate to try again.
              </div>
            )}
            {s && !active && s.finished_at && (
              <div className="alert alert-info small">
                Last sync: started {when(s.started_at)} · {s.note ?? 'Finished'} {when(s.finished_at)}.
              </div>
            )}
          </div>
        </Drawer>
      )}
    </>
  )
}

function Progress({ done, total, pct }: { done: number; total: number; pct: number }) {
  return (
    <div className="sync-progress">
      <div className="sync-bar">
        <span style={{ width: `${pct}%` }} />
      </div>
      <span className="small">
        <b>{done.toLocaleString('en-IN')}</b> / {total.toLocaleString('en-IN')} · {pct}%
      </span>
    </div>
  )
}
