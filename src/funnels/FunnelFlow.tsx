import { ArrowDown } from 'lucide-react'
import type { FunnelFlow as Flow } from '@/meta/api'

const inr = (n: number) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`
const num = (n: number) => Number(n || 0).toLocaleString('en-IN')
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—')
const COLORS = ['#7c3aed', '#9333ea', '#c026d3', '#2563eb', '#0d9488', '#d97706', '#ea580c', '#16a34a', '#0891b2', '#4f46e5']

/** the Ad performance cards' accent colours, in turn */
const CARD_TONES = ['#6366f1', '#0ea5e9', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6', '#22c55e', '#f97316']

type Stage = { tag: string; value: string; title: string; sub: string; color: string }
type Step = { stage: Stage; rate?: string }

/** Funnel → Overview: the 3D funnel — Facebook reach → clicks → page views → leads → each stage reached → revenue — then profit and the ad numbers */
export function FunnelFlow({ f, gst }: { f: Flow; gst: number }) {
  // every amount without GST (the Ad spend tile shows the GST on hover)
  const spendGst = f.spend_gst != null ? Number(f.spend_gst) : Number(f.spend) * gst
  const spendEx = Number(f.spend)
  const src = f.source ?? 'fb'
  const where = src === 'fb' ? 'Facebook / Instagram' : src === 'google' ? 'Google Ads' : 'Facebook / Instagram + Google Ads'
  // landing page views are Facebook's (Google doesn't count them): only on the Facebook view
  const withLpv = src === 'fb'
  const base = withLpv ? f.lpv : f.link_clicks
  const baseWord = withLpv ? 'views' : 'clicks'
  const steps: Step[] = []
  let i = 0
  const color = () => COLORS[i++ % COLORS.length]
  const ads = f.linked > 0 && Number(f.impressions) > 0
  if (ads) {
    steps.push({ stage: { tag: 'Ad reach', value: num(f.impressions), title: 'Ad impressions', sub: `Shown on ${where} · CPM ${inr((spendEx / f.impressions) * 1000)}`, color: color() } })
    steps.push({
      rate: `${pct(f.link_clicks, f.impressions)} CTR · ${num(f.link_clicks)} clicks from ${num(f.impressions)} impressions`,
      stage: { tag: 'Traffic', value: num(f.link_clicks), title: 'Link clicks', sub: `Cost per click ${inr(f.link_clicks ? spendEx / f.link_clicks : 0)}`, color: color() },
    })
    if (withLpv) steps.push({
      rate: `${pct(f.lpv, f.link_clicks)} click-to-view rate · ${num(f.lpv)} page views from ${num(f.link_clicks)} clicks`,
      stage: { tag: 'Landing page', value: num(f.lpv), title: 'Landing page views', sub: `Cost per view ${inr(f.lpv ? spendEx / f.lpv : 0)}`, color: color() },
    })
  }
  const organic = f.leads - f.leads_ads
  steps.push({
    rate: ads ? `${pct(f.leads_ads, base)} ${withLpv ? 'page' : 'click'} conversion · ${num(f.leads_ads)} ad leads from ${num(base)} ${baseWord} (+${num(organic)} organic)` : undefined,
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
  const profit = Number(f.revenue) - spendEx

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
        <div className="flow-tile" style={{ background: '#c2410c' }} title={`${inr(spendEx)} + GST = ${inr(spendGst)} with GST`}>
          <b>{inr(spendEx)}</b>
          <span>Ad spend</span>
          <small>without GST</small>
        </div>
        <div className="flow-tile" style={{ background: profit >= 0 ? '#15803d' : '#b91c1c' }}>
          <b>{inr(profit)}</b>
          <span>Gross profit</span>
          <small>Revenue − ad spend</small>
        </div>
        <div className="flow-tile" style={{ background: '#1d4ed8' }}>
          <b>{spendEx ? `${(Number(f.revenue) / spendEx).toFixed(2)}×` : '—'}</b>
          <span>ROAS</span>
          <small>Revenue ÷ ad spend</small>
        </div>
        <div className="flow-tile" style={{ background: '#0f766e' }}>
          <b>{won ? inr(spendEx / won) : '—'}</b>
          <span>CAC</span>
          <small>Ad spend per won lead</small>
        </div>
        <div className="flow-tile" style={{ background: '#6d28d9' }}>
          <b>{f.leads ? inr(spendEx / f.leads) : '—'}</b>
          <span>Cost per lead</span>
          <small>Ad spend ÷ all leads</small>
        </div>
      </div>

      {ads && (
        <div>
          <b>Ad performance breakdown</b> <span className="muted small">({where}, the linked campaigns, these dates)</span>
          <div className="flow-cards">
            {[
              [num(f.impressions), 'Impressions', 'Total ads shown'],
              [inr((spendEx / f.impressions) * 1000), 'CPM', 'Cost per 1,000 impressions'],
              [num(f.link_clicks), withLpv ? 'Link clicks' : 'Clicks', `CTR ${pct(f.link_clicks, f.impressions)} · ${inr(f.link_clicks ? spendEx / f.link_clicks : 0)} per click`],
              ...(withLpv
                ? [
                    [num(f.lpv), 'Landing page views', `Click-to-view rate ${pct(f.lpv, f.link_clicks)}`],
                    [inr(f.lpv ? spendEx / f.lpv : 0), 'Cost per page view', 'Ad spend ÷ landing page views'],
                  ]
                : []),
              [pct(f.leads_ads, base), withLpv ? 'Page conversion' : 'Click conversion', `${num(f.leads_ads)} ad leads from ${num(base)} ${baseWord}`],
              // Overall / Google (no page-view cards): the ad leads themselves and their cost
              ...(withLpv ? [] : [[num(f.leads_ads), 'Ad leads', f.leads_ads ? `${inr(spendEx / f.leads_ads)} per ad lead` : 'Leads from the linked campaigns']]),
              ...(src !== 'google'
                ? [
                    [num(f.meta_leads), 'Facebook leads', f.meta_leads ? `${inr(spendEx / f.meta_leads)} per lead (Facebook’s count)` : 'Facebook’s count'],
                    [num(f.purchases), 'Purchases (Pixel)', f.purchases ? `${inr(spendEx / f.purchases)} per purchase` : 'No purchase events'],
                  ]
                : []),
              ...(src !== 'fb' ? [[num(Number(f.conversions ?? 0)), 'Google conversions', f.conversions ? `${inr(spendEx / Number(f.conversions))} per conversion (Google’s count)` : 'Google’s count']] : []),
            ].map(([v, l, s], k) => (
              <div key={l} className="flow-card" style={{ ['--c' as string]: CARD_TONES[k % CARD_TONES.length] }}>
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
