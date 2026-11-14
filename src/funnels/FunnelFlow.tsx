import { ArrowDown } from 'lucide-react'
import type { FunnelFlow as Flow } from '@/meta/api'

const inr = (n: number) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`
const num = (n: number) => Number(n || 0).toLocaleString('en-IN')
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—')
const COLORS = ['#7c3aed', '#9333ea', '#c026d3', '#2563eb', '#0d9488', '#d97706', '#ea580c', '#16a34a', '#0891b2', '#4f46e5']

type Stage = { tag: string; value: string; title: string; sub: string; color: string }
type Step = { stage: Stage; rate?: string }

/** Funnel → Overview: the 3D funnel — Facebook reach → clicks → page views → leads → each stage reached → revenue — then profit and the ad numbers */
export function FunnelFlow({ f, gst }: { f: Flow; gst: number }) {
  const spendGst = Number(f.spend) * gst
  const steps: Step[] = []
  let i = 0
  const color = () => COLORS[i++ % COLORS.length]
  const ads = f.linked > 0 && Number(f.impressions) > 0
  if (ads) {
    steps.push({ stage: { tag: 'Ad reach', value: num(f.impressions), title: 'Ad impressions', sub: `Shown on Facebook / Instagram · CPM ${inr((spendGst / f.impressions) * 1000)}`, color: color() } })
    steps.push({
      rate: `${pct(f.link_clicks, f.impressions)} CTR · ${num(f.link_clicks)} clicks from ${num(f.impressions)} impressions`,
      stage: { tag: 'Traffic', value: num(f.link_clicks), title: 'Link clicks', sub: `Cost per click ${inr(f.link_clicks ? spendGst / f.link_clicks : 0)}`, color: color() },
    })
    steps.push({
      rate: `${pct(f.lpv, f.link_clicks)} click-to-view rate · ${num(f.lpv)} page views from ${num(f.link_clicks)} clicks`,
      stage: { tag: 'Landing page', value: num(f.lpv), title: 'Landing page views', sub: `Cost per view ${inr(f.lpv ? spendGst / f.lpv : 0)}`, color: color() },
    })
  }
  const organic = f.leads - f.leads_ads
  steps.push({
    rate: ads ? `${pct(f.leads_ads, f.lpv)} page conversion · ${num(f.leads_ads)} ad leads from ${num(f.lpv)} views (+${num(organic)} organic)` : undefined,
    stage: { tag: 'Leads', value: num(f.leads), title: 'Leads', sub: `Ads ${num(f.leads_ads)} · Organic ${num(organic)}`, color: color() },
  })
  // the funnel's own stages after the first (the first is every lead)
  let prev = f.leads
  for (const s of f.stages.slice(1)) {
    steps.push({
      rate: `${pct(s.n, prev)} · ${num(s.n)} of ${num(prev)} reached ${s.name}`,
      stage: { tag: s.kind === 'won' ? 'Won' : 'Stage', value: num(s.n), title: s.name, sub: `Ads ${num(s.ads)} · Organic ${num(s.n - s.ads)}`, color: color() },
    })
    prev = s.n
  }
  steps.push({
    rate: `Bookings of these leads, with GST · ${inr(f.collected)} collected`,
    stage: { tag: 'Revenue', value: inr(f.revenue), title: 'Revenue', sub: `Ads ${inr(f.revenue_ads)} · Organic ${inr(f.revenue - f.revenue_ads)}`, color: '#16a34a' },
  })

  const n = steps.length
  const won = f.stages.find((s) => s.kind === 'won')?.n ?? 0
  const profit = Number(f.revenue) - spendGst

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="flow">
        {steps.map((st, k) => {
          const top = 100 - (k * 50) / n
          const bottom = 100 - ((k + 1) * 50) / n
          const inset = ((1 - bottom / top) / 2) * 100
          return (
            <div key={k} className="flow-step">
              {st.rate && (
                <div className="flow-rate">
                  <ArrowDown size={13} /> {st.rate}
                </div>
              )}
              <div
                className="flow-stage"
                style={{ width: `${top}%`, background: `linear-gradient(180deg, ${st.stage.color}, ${st.stage.color}dd)`, clipPath: `polygon(0 0, 100% 0, ${100 - inset}% 100%, ${inset}% 100%)` }}
              >
                <span className="flow-tag">
                  Stage {k + 1} · {st.stage.tag}
                </span>
                <b className="flow-value">{st.stage.value}</b>
                <span className="flow-title">{st.stage.title}</span>
                <span className="flow-sub">{st.stage.sub}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flow-tiles">
        <div className="flow-tile" style={{ background: '#c2410c' }} title={`${inr(f.spend)} + GST = ${inr(spendGst)}`}>
          <b>{inr(spendGst)}</b>
          <span>Ad spend</span>
          <small>with GST</small>
        </div>
        <div className="flow-tile" style={{ background: profit >= 0 ? '#15803d' : '#b91c1c' }}>
          <b>{inr(profit)}</b>
          <span>Gross profit</span>
          <small>Revenue − ad spend</small>
        </div>
        <div className="flow-tile" style={{ background: '#1d4ed8' }}>
          <b>{spendGst ? `${(Number(f.revenue) / spendGst).toFixed(2)}×` : '—'}</b>
          <span>ROAS</span>
          <small>Revenue ÷ ad spend</small>
        </div>
        <div className="flow-tile" style={{ background: '#0f766e' }}>
          <b>{won ? inr(spendGst / won) : '—'}</b>
          <span>CAC</span>
          <small>Ad spend per won lead</small>
        </div>
        <div className="flow-tile" style={{ background: '#6d28d9' }}>
          <b>{f.leads ? inr(spendGst / f.leads) : '—'}</b>
          <span>Cost per lead</span>
          <small>Ad spend ÷ all leads</small>
        </div>
      </div>

      {ads && (
        <div>
          <b>Ad performance breakdown</b> <span className="muted small">(Facebook / Instagram, the linked campaigns, these dates)</span>
          <div className="flow-cards">
            {[
              [num(f.impressions), 'Impressions', 'Total ads shown'],
              [inr((spendGst / f.impressions) * 1000), 'CPM', 'Cost per 1,000 impressions'],
              [num(f.link_clicks), 'Link clicks', `CTR ${pct(f.link_clicks, f.impressions)} · ${inr(f.link_clicks ? spendGst / f.link_clicks : 0)} per click`],
              [num(f.lpv), 'Landing page views', `Click-to-view rate ${pct(f.lpv, f.link_clicks)}`],
              [inr(f.lpv ? spendGst / f.lpv : 0), 'Cost per page view', 'Ad spend ÷ landing page views'],
              [pct(f.leads_ads, f.lpv), 'Page conversion', `${num(f.leads_ads)} ad leads from ${num(f.lpv)} views`],
              [num(f.meta_leads), 'Facebook leads', f.meta_leads ? `${inr(spendGst / f.meta_leads)} per lead (Facebook’s count)` : 'Facebook’s count'],
              [num(f.purchases), 'Purchases (Pixel)', f.purchases ? `${inr(spendGst / f.purchases)} per purchase` : 'No purchase events'],
            ].map(([v, l, s]) => (
              <div key={l} className="flow-card">
                <b>{v}</b>
                <span>{l}</span>
                <small className="muted">{s}</small>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="muted small">
        Ads leads = leads whose form sent the name of a campaign linked to this funnel. A stage counts every lead that got to it or past it (Lost leads count up to where they were).
      </div>
    </div>
  )
}
