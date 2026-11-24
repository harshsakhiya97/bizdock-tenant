import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Sparkles, Square } from 'lucide-react'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { db } from '@/lib/supabase'
import { useTenant } from '@/tenant/useTenant'
import type { InsightStatus } from './insights'

const when = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '')

/**
 * Leads → Summarize leads: the leads with no AI summary yet; Start writes them (Gemini) in the background, newest
 * first, a few at a time every minute, with live progress here. New and changed leads get theirs by themselves.
 */
export function SummarizeLeads({ canRun }: { canRun: boolean }) {
  const tenant = useTenant()
  const [st, setSt] = useState<InsightStatus | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    db()
      .rpc('lead_insight_status', { p_tenant: tenant.id })
      .then(({ data, error: e }) => (e ? setError(e.message) : setSt(data as InsightStatus)))
  }, [tenant.id])
  useEffect(load, [load])
  const active = !!st?.sync?.active
  useEffect(() => {
    if (!active && !open) return
    const t = window.setInterval(load, 10_000)
    return () => window.clearInterval(t)
  }, [active, open, load])

  if (!st) return null

  async function set(on: boolean) {
    setBusy(true)
    setError(null)
    const { error: e } = await db().rpc('lead_insight_sync_set', { p_tenant: tenant.id, p_on: on })
    if (e) setError(e.message)
    load()
    setBusy(false)
  }

  const s = st.sync
  const written = s ? Math.max(0, s.total - st.missing) : 0
  const pct = s?.total ? Math.min(100, Math.round((written / s.total) * 100)) : 100

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Sparkles size={15} /> {active ? 'Summarizing…' : `Summarize leads${st.missing ? ` (${st.missing.toLocaleString('en-IN')})` : ''}`}
      </Button>
      {open && (
        <Drawer
          open
          onClose={() => setOpen(false)}
          width={520}
          title="Summarize leads"
          footer={
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
              <div className="foot-end">
                {error && <p className="err-text">{error}</p>}
                {canRun &&
                  (active ? (
                    <Button variant="outline" onClick={() => void set(false)} disabled={busy}>
                      <Square size={14} /> Stop
                    </Button>
                  ) : (
                    <Button onClick={() => void set(true)} disabled={busy || !st.missing || !st.gemini}>
                      <Sparkles size={14} /> {busy ? 'Starting…' : 'Start'}
                    </Button>
                  ))}
              </div>
            </>
          }
        >
          <div className="stack">
            <p className="muted small" style={{ margin: 0 }}>
              Gemini AI reads each lead’s details, follow-up comments, call transcripts, meetings, payments and WhatsApp messages and writes a short summary (Lead page → AI Insights). Names and phone numbers are hidden from it. Runs in the background (every minute); you can close this and come back. New and changed leads get their summary by themselves.
            </p>
            <div className="sync-row">
              <div className="sync-head">
                <b>Leads without a summary</b>
                <span className="muted small">{st.done.toLocaleString('en-IN')} already have one</span>
              </div>
              {!st.gemini ? (
                <div className="small">
                  {st.missing.toLocaleString('en-IN')} lead{st.missing === 1 ? '' : 's'} to summarize.{' '}
                  <span className="muted">
                    Connect <Link to="/integrations">System Connections → Gemini AI</Link> to start.
                  </span>
                </div>
              ) : active && s?.total ? (
                <div className="sync-progress">
                  <div className="sync-bar">
                    <span style={{ width: `${pct}%` }} />
                  </div>
                  <span className="small">
                    <b>{written.toLocaleString('en-IN')}</b> / {s.total.toLocaleString('en-IN')} · {pct}%
                  </span>
                </div>
              ) : (
                <div className="small">{st.missing ? `${st.missing.toLocaleString('en-IN')} to summarize` : 'Every lead has a summary.'}</div>
              )}
              {active && <div className="muted small">Each lead uses a little of the monthly AI limit; if it’s used up, the sync stops.</div>}
            </div>
            {st.failed > 0 && <div className="muted small">{st.failed} lead{st.failed === 1 ? '' : 's'} couldn’t be summarized (3 tries): open one and press Summarize to try again.</div>}
            {s && !active && s.finished_at && (
              <div className="alert alert-info small">
                Last run: started {when(s.started_at)} · {s.note ?? 'Finished'} {when(s.finished_at)}.
              </div>
            )}
          </div>
        </Drawer>
      )}
    </>
  )
}
