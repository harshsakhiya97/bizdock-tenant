import type { ReactNode } from 'react'
import type { FunnelFlow as Flow } from '@/meta/api'

const inr = (n: number) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`
const num = (n: number) => Number(n || 0).toLocaleString('en-IN')
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—')
const x = (a: number, b: number) => (b ? `${(a / b).toFixed(2)}x` : '—')
const NA = <span className="sc-na">NA</span>

type Line = { label: ReactNode; ads: ReactNode; organic: ReactNode; total: ReactNode; strong?: boolean }
type Group = { name: string; tone: string; lines: Line[] }

/**
 * Funnel → Overview → Scorecard: the same numbers as the funnel, as one table in sections (Marketing, Funnel, Data,
 * Business) with Ads / Organic / Total columns. Ad numbers (spend, impressions, clicks…) are Ads only: Organic shows NA.
 */
export function FunnelScorecard({ f, gst }: { f: Flow; gst: number }) {
  const spend = Number(f.spend)
  const spendGst = f.spend_gst != null ? Number(f.spend_gst) : spend * gst
  const src = f.source ?? 'fb'
  const withLpv = src === 'fb'
  const leadsAds = Number(f.leads_ads)
  const leadsOrg = Number(f.leads) - leadsAds
  const revAds = Number(f.revenue_ads)
  const revOrg = Number(f.revenue) - revAds
  const stages = f.stages.slice(1)
  const won = f.stages.find((s) => s.kind === 'won')
  const adOnly = (v: ReactNode): Pick<Line, 'ads' | 'organic' | 'total'> => ({ ads: v, organic: NA, total: v })

  const marketing: Line[] = [
    { label: 'Amount spent', ...adOnly(<span title={`${inr(spendGst)} with GST`}>{inr(spend)}</span>), strong: true },
    { label: 'Impressions', ...adOnly(num(f.impressions)) },
    { label: 'CPM', ...adOnly(f.impressions ? inr((spend / f.impressions) * 1000) : '—') },
    { label: 'Link clicks', ...adOnly(num(f.link_clicks)) },
    { label: 'CTR', ...adOnly(pct(f.link_clicks, f.impressions)) },
    { label: 'Cost per click', ...adOnly(f.link_clicks ? inr(spend / f.link_clicks) : '—') },
    ...(withLpv
      ? [
          { label: 'Landing page views', ...adOnly(num(f.lpv)) },
          { label: 'Cost per LP view', ...adOnly(f.lpv ? inr(spend / f.lpv) : '—') },
          { label: 'Page conversion (LP view → lead)', ...adOnly(pct(leadsAds, f.lpv)) },
        ]
      : [{ label: 'Click conversion (click → lead)', ...adOnly(pct(leadsAds, f.link_clicks)) }]),
    { label: 'Leads', ads: num(leadsAds), organic: num(leadsOrg), total: num(f.leads), strong: true },
    { label: 'CPL', ...{ ads: leadsAds ? inr(spend / leadsAds) : '—', organic: NA, total: f.leads ? inr(spend / f.leads) : '—' } },
  ]

  const funnel: Line[] = stages.map((s) => ({
    label: s.name,
    ads: num(s.ads),
    organic: num(s.n - s.ads),
    total: num(s.n),
    strong: s.kind === 'won',
  }))
  if (f.lost) funnel.push({ label: 'Lost', ads: NA, organic: NA, total: num(f.lost) })

  const data: Line[] = stages.map((s) => ({
    label: `Lead → ${s.name}`,
    ads: pct(s.ads, leadsAds),
    organic: pct(s.n - s.ads, leadsOrg),
    total: pct(s.n, f.leads),
  }))

  const wonAds = won?.ads ?? 0
  const wonAll = won?.n ?? 0
  const business: Line[] = [
    { label: 'Revenue', ads: inr(revAds), organic: inr(revOrg), total: inr(f.revenue), strong: true },
    { label: 'Collected', ads: NA, organic: NA, total: inr(f.collected) },
    { label: 'Gross profit (revenue − ad spend)', ads: inr(revAds - spend), organic: inr(revOrg), total: inr(Number(f.revenue) - spend), strong: true },
    { label: 'ROAS', ads: x(revAds, spend), organic: NA, total: x(Number(f.revenue), spend) },
    ...(won ? [{ label: `Cost per ${won.name} (CAC)`, ads: wonAds ? inr(spend / wonAds) : '—', organic: NA, total: wonAll ? inr(spend / wonAll) : '—' }] : []),
  ]

  const groups: Group[] = [
    { name: 'Marketing', tone: 'green', lines: marketing },
    ...(funnel.length ? [{ name: 'Funnel', tone: 'blue', lines: funnel }] : []),
    ...(data.length ? [{ name: 'Data', tone: 'yellow', lines: data }] : []),
    { name: 'Business', tone: 'peach', lines: business },
  ]

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="table-wrap sc-wrap">
        <table className="sc-table">
          <thead>
            <tr>
              <th className="sc-sec">Section</th>
              <th>Metric</th>
              <th className="num">Ads</th>
              <th className="num">Organic</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) =>
              g.lines.map((l, i) => (
                <tr key={`${g.name}-${i}`} className={`sc-${g.tone}`}>
                  {i === 0 && (
                    <th rowSpan={g.lines.length} className="sc-sec" scope="rowgroup">
                      {g.name}
                    </th>
                  )}
                  <td>{l.label}</td>
                  <td className="num">{l.ads}</td>
                  <td className="num">{l.organic}</td>
                  <td className={l.strong ? 'num sc-strong' : 'num'}>{l.total}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
      <div className="muted small">
        Amounts spent without GST (hover: with GST). Ads = leads from Facebook / Google ads (their UTM), Organic = every other lead of this funnel. Funnel = leads that reached each stage; Data = those as a % of the leads.
        CPL = spend ÷ leads · ROAS = revenue ÷ spend · CAC = spend ÷ won.
      </div>
    </div>
  )
}
