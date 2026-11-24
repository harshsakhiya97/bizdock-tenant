import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { RefreshCw, Sparkles } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ago } from '@/team/time'
import { getLeadInsight, refreshLeadInsight, type InsightRow } from './insights'

const LEVEL = { hot: { label: 'Hot', tone: 'badge-danger' }, warm: { label: 'Warm', tone: 'badge-warning' }, cold: { label: 'Cold', tone: 'badge-info' } } as const
const known = (s: string | null | undefined) => !!s && !/^not mentioned\.?$/i.test(s.trim())

/**
 * Lead page → AI Insights: Gemini's summary of the lead (details, follow-ups, call transcripts, meetings, payments,
 * WhatsApp). It is written again by itself a minute after the lead changes; Refresh writes it now.
 */
export function LeadInsightCard({ leadId, refreshKey }: { leadId: string; refreshKey?: number }) {
  const [row, setRow] = useState<InsightRow | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    getLeadInsight(leadId).then(setRow, () => setRow(null))
  }, [leadId])
  useEffect(load, [load, refreshKey])
  // while an update is due, look again every 30 seconds
  useEffect(() => {
    if (!row?.stale || busy) return
    const t = window.setInterval(load, 30_000)
    return () => window.clearInterval(t)
  }, [row?.stale, busy, load])

  async function refresh() {
    setBusy(true)
    setError(null)
    try {
      const r = await refreshLeadInsight(leadId)
      setRow({ content: r.content, generated_at: r.generated_at, stale: false, error: null, tries: 0 })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const c = row?.content
  const lv = c ? LEVEL[c.interest?.level] : null
  const points = c ? ([['Needs', c.needs], ['Budget', c.budget], ['Timeline', c.timeline]] as const).filter(([, v]) => known(v)) : []

  return (
    <div className="glance-card ai-card">
      <div className="row-between">
        <span className="glance-title">
          <Sparkles size={15} /> AI Insights
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void refresh()} disabled={busy} title="Write it again now">
          <RefreshCw size={13} className={cn(busy && 'spin')} /> {busy ? 'Writing…' : c ? 'Refresh' : 'Summarize'}
        </button>
      </div>
      {error && (
        <div className="err-text small">
          {error}
          {/not connected/i.test(error) && (
            <>
              {' '}
              <Link to="/integrations">System Connections → Gemini AI</Link>
            </>
          )}
        </div>
      )}
      {row === undefined ? (
        <div className="muted small">Loading…</div>
      ) : !c ? (
        <div className="muted small">{busy ? 'Reading this lead’s details, follow-ups and calls…' : row?.stale ? 'No summary yet: it’s written a minute after the lead changes, or press Summarize.' : 'No summary yet. Press Summarize.'}</div>
      ) : (
        <div className="ai-body">
          <div className="ai-col">
          {lv && (
            <div className="ai-interest">
              <span className={cn('badge', lv.tone)}>{lv.label}</span>
              <span className="small">{c.interest.why}</span>
            </div>
          )}
          <p className="ai-summary">{c.summary}</p>
          {points.length > 0 && (
            <dl className="ai-points">
              {points.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}
          </div>
          <div className="ai-col">
          {c.objections?.length > 0 && (
            <div>
              <span className="ai-label">Objections</span>
              <ul className="ai-list">
                {c.objections.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </div>
          )}
          {known(c.next_action) && (
            <div className="ai-next">
              <span className="ai-label">Next best action</span>
              <div>{c.next_action}</div>
            </div>
          )}
          {c.risks?.length > 0 && (
            <div>
              <span className="ai-label">Risks</span>
              <ul className="ai-list ai-risks">
                {c.risks.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </div>
          )}
          </div>
          <div className="muted small ai-foot">
            Updated {ago(row?.generated_at ?? null)}
            {row?.stale && !busy ? ' · new changes: updating shortly' : ''}
          </div>
        </div>
      )}
    </div>
  )
}
