import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { BT } from '@/auth/auth-context'
import { activeType } from '@/business/activeType'
import { presetRange, rangeLabel, type Range } from '@/components/DateRange'
import { StatRecords, type StatShow } from '@/components/StatRecords'
import { leadCols } from '@/leads/statCols'
import type { LeadRow, MemberOption } from '@/leads/types'
import { FunnelAdsReport, fromSrc, leadDay, type Src } from './FunnelAdsReport'
import type { FunnelRow, SubmissionRow } from './types'

/**
 * A funnel's report: the four tiles (Leads, From forms & sheets, Form posts, Won) and the Funnel report (Funnel /
 * Scorecard / Lead flow / List). One component for Funnel → Overview and Reports → Funnel Report, so a change here
 * shows in both.
 */
export function FunnelOverviewReport({ funnel, leads, subs, members }: { funnel: FunnelRow; leads: LeadRow[] | null; subs: SubmissionRow[]; members: MemberOption[] }) {
  const navigate = useNavigate()
  const { businesses } = useAuth()
  // the report's period and source (Overall / Facebook / Google); the tiles follow them too.
  // Same presets as Facebook Ads Manager (Last 30 days ends yesterday), so the numbers match
  const [repRange, setRepRange] = useState<Range>(() => presetRange('last30'))
  const [repSrc, setRepSrc] = useState<Src>('all')
  const [leadShow, setLeadShow] = useState<StatShow<LeadRow> | null>(null)
  const [subShow, setSubShow] = useState<StatShow<SubmissionRow> | null>(null)
  const stageOf = useMemo(() => new Map((funnel.funnel_stages ?? []).map((s) => [s.id, s])), [funnel])
  const wonIds = useMemo(() => new Set((funnel.funnel_stages ?? []).filter((s) => s.kind === 'won').map((s) => s.id)), [funnel])
  const leadName = useMemo(() => new Map((leads ?? []).map((l) => [l.id, [l.first_name, l.last_name].filter(Boolean).join(' ')])), [leads])
  const biz = businesses.find((b) => b.id === funnel.business_id)
  const podcast = activeType(biz ?? null, biz?.subs.find((x) => x.id === funnel.sub_business_id) ?? null) === BT.PAID_PODCAST

  // the tiles: the leads created in the report's period, from its source (and their form posts)
  const inRep = (ts: string) => {
    const d = leadDay(ts)
    return d >= repRange.from && d <= repRange.to
  }
  const tileLeads = (leads ?? []).filter((l) => inRep(l.created_at) && fromSrc(l, repSrc))
  const leadOf = new Map((leads ?? []).map((l) => [l.id, l]))
  const tilePosts = subs.filter((x) => x.via === 'webhook' && inRep(x.created_at) && (repSrc === 'all' || (!!x.lead_id && !!leadOf.get(x.lead_id) && fromSrc(leadOf.get(x.lead_id)!, repSrc))))
  const fromForms = tileLeads.filter((l) => l.webhook_id || l.landing_page_id || l.sheet_id).length
  const won = tileLeads.filter((l) => stageOf.get(l.stage_id ?? '')?.kind === 'won').length
  // the tiles open their records: leads, or the form posts
  const showLeads = (title: string, f: (l: LeadRow) => boolean) => setLeadShow({ title, rows: tileLeads.filter(f), cols: leadCols(members) })
  const showPosts = () =>
    setSubShow({
      title: 'Form posts',
      rows: tilePosts,
      cols: [
        { label: 'Received', render: (x) => <span className="nowrap">{new Date(x.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span> },
        { label: 'Lead', render: (x) => (x.lead_id ? <b>{leadName.get(x.lead_id) || 'Lead'}</b> : <span className="muted">—</span>) },
        { label: 'New / existing', render: (x) => (x.is_new ? <span className="badge badge-success">New lead</span> : <span className="badge badge-muted">Existing lead</span>) },
        { label: 'Result', render: (x) => x.result || x.action || <span className="muted">—</span> },
        { label: 'UTM', render: (x) => <span className="small">{[x.utm_source, x.utm_campaign].filter(Boolean).join(' · ') || '—'}</span> },
      ],
    })

  return (
    <>
      <div className="muted small">
        {rangeLabel(repRange)} · {repSrc === 'all' ? 'Overall (Facebook + Google)' : repSrc === 'fb' ? 'Facebook' : 'Google'}: the Funnel report’s period and source (change them below).
      </div>
      <div className="flow-cards pay-cards">
        {(
          [
            [leads ? String(tileLeads.length) : '—', 'Leads', 'Every lead of this funnel, these dates', '#6366f1', () => showLeads('Leads', () => true)],
            [String(fromForms), 'From forms & sheets', leads && tileLeads.length ? `${Math.round((fromForms / tileLeads.length) * 100)}% of the leads` : 'Webhooks, landing pages, sheets', '#0ea5e9', () => showLeads('From forms & sheets', (l) => !!(l.webhook_id || l.landing_page_id || l.sheet_id))],
            [String(tilePosts.length), 'Form posts', 'Every form sent (new + repeat)', '#f59e0b', showPosts],
            [String(won), 'Won', leads && tileLeads.length ? `${((won / tileLeads.length) * 100).toFixed(1)}% conversion` : 'Leads that reached a won stage', '#22c55e', () => showLeads('Won', (l) => stageOf.get(l.stage_id ?? '')?.kind === 'won')],
          ] as [string, string, string, string, () => void][]
        ).map(([v, l, sub, c, go]) => (
          <button key={l} type="button" className="flow-card" style={{ ['--c' as string]: c }} onClick={go}>
            <b>{v}</b>
            <span>{l}</span>
            <small className="muted">{sub}</small>
          </button>
        ))}
      </div>
      <StatRecords show={leadShow} onClose={() => setLeadShow(null)} rowKey={(l) => l.id} onRow={(l) => navigate(`/leads/${l.id}`)} />
      <StatRecords show={subShow} onClose={() => setSubShow(null)} rowKey={(x) => x.id} onRow={(x) => x.lead_id && navigate(`/leads/${x.lead_id}`)} />

      <FunnelAdsReport key={funnel.id} funnelId={funnel.id} leads={leads} range={repRange} setRange={setRepRange} src={repSrc} setSrc={setRepSrc} podcast={podcast} wonIds={wonIds} />
    </>
  )
}
