import { useEffect, useMemo, useState } from 'react'
import { Paged } from '@/components/ui'
import { cn } from '@/lib/cn'
import { funnelAdsReport, funnelFlow, type AdsReport, type FunnelFlow as Flow } from '@/meta/api'
import { FunnelFlow } from './FunnelFlow'

const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
const num = (n: number | null | undefined) => Number(n || 0).toLocaleString('en-IN')
const day = (d: Date) => d.toLocaleDateString('en-CA')
const ago = (n: number) => day(new Date(Date.now() - n * 86400_000))
const PRESETS = [
  { key: '7', label: 'Last 7 days', from: () => ago(6) },
  { key: '30', label: 'Last 30 days', from: () => ago(29) },
  { key: '90', label: 'Last 90 days', from: () => ago(89) },
  { key: 'month', label: 'This month', from: () => `${day(new Date()).slice(0, 8)}01` },
  { key: 'all', label: 'Everything', from: () => '2020-01-01' },
] as const

/** a money tile with GST: shows spend with GST, hover → without GST + GST */
function GstMoney({ ex, inc }: { ex: number; inc: number }) {
  return (
    <span title={`${inr(ex)} + GST ${inr(inc - ex)} = ${inr(inc)}`} className="gst-hover">
      {inr(inc)}
    </span>
  )
}

/** Funnel → Overview: from the ad spend to the money (spend with GST → leads → won → revenue → collected → balance). */
export function FunnelAdsReport({ funnelId }: { funnelId: string }) {
  const [preset, setPreset] = useState<string>('30')
  const [from, setFrom] = useState(ago(29))
  const [to, setTo] = useState(day(new Date()))
  const [r, setR] = useState<AdsReport | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [flow, setFlow] = useState<Flow | null>(null)

  useEffect(() => {
    setR(undefined)
    setError(null)
    setFlow(null)
    funnelAdsReport(funnelId, from, to).then(setR, (e: Error) => setError(e.message))
    funnelFlow(funnelId, from, to).then(setFlow, (e: Error) => setError(e.message))
  }, [funnelId, from, to])

  // the old CRM's saved day-wise spend is hidden for now: only Facebook's numbers
  const fbDays = useMemo(() => (r?.days ?? []).filter((d) => d.meta), [r])
  const maxDay = useMemo(() => Math.max(1, ...fbDays.map((d) => Number(d.spend_gst))), [fbDays])
  const maxLeads = useMemo(() => Math.max(1, ...fbDays.map((d) => d.leads)), [fbDays])

  const pickPreset = (k: string) => {
    setPreset(k)
    const p = PRESETS.find((x) => x.key === k)
    if (p) {
      setFrom(p.from())
      setTo(day(new Date()))
    }
  }

  const spend = fbDays.reduce((t, d) => t + Number(d.spend_gst), 0)
  const spendEx = fbDays.reduce((t, d) => t + Number(d.spend), 0)
  const balance = Number(r?.revenue ?? 0) - Number(r?.collected ?? 0)
  const tiles = r
    ? [
        { label: 'Ad spend (with GST)', value: <GstMoney ex={spendEx} inc={spend} /> },
        { label: 'Leads', value: num(r.leads), sub: r.leads ? `${inr(spend / r.leads)} per lead` : '' },
        { label: 'Won', value: num(r.won), sub: r.won ? `${inr(spend / r.won)} per sale` : '', tone: 'tone-success' },
        { label: 'Revenue (with GST)', value: inr(r.revenue), sub: spend ? `${(Number(r.revenue) / spend).toFixed(2)}× of spend (ROAS)` : '' },
        { label: 'Collected', value: inr(r.collected), tone: 'tone-success' },
        { label: 'Balance due', value: inr(balance), tone: balance > 0 ? 'tone-danger' : '' },
      ]
    : []

  return (
    <section className="card card-pad stack" style={{ gap: 14 }}>
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <b>Ads → leads → money</b>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <select className="input input-sm filter-select" aria-label="Period" value={preset} onChange={(e) => pickPreset(e.target.value)}>
            {PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
            <option value="custom">Custom dates</option>
          </select>
          {preset === 'custom' && (
            <>
              <input className="input input-sm filter-select" type="date" aria-label="From" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
              <input className="input input-sm filter-select" type="date" aria-label="To" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </>
          )}
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {r === undefined && !error && <div className="muted small">Loading…</div>}
      {r === null && <div className="muted small">You can’t see this funnel’s report.</div>}
      {r && (
        <>
          <div className="pl-tiles fp-tiles">
            {tiles.map((t) => (
              <div key={t.label} className="pl-tile">
                <div className="pl-tile-label">{t.label}</div>
                <div className={cn('pl-tile-value', t.tone)}>{t.value}</div>
                {t.sub && <div className="muted small">{t.sub}</div>}
              </div>
            ))}
          </div>
          {!r.linked && <div className="muted small">No Facebook campaigns are linked to this funnel yet (Facebook Ads tab), so there’s no ad spend.</div>}

          {/* the 3D funnel: reach → clicks → page views → leads → stages → revenue */}
          {flow && <FunnelFlow f={flow} gst={spendEx ? spend / spendEx : 1.18} />}

          {/* spend and leads per day */}
          {fbDays.length > 0 && (
            <div>
              <div className="muted small" style={{ marginBottom: 6 }}>
                Spend per day (bars, with GST) and leads (dots)
              </div>
              <div className="ads-days">
                {fbDays.map((d) => (
                  <div key={d.day} className="ads-day" title={`${d.day}: ${inr(Number(d.spend_gst))} spend (${inr(Number(d.spend))} + GST)${d.meta ? '' : ' · saved spend'} · ${d.leads} lead${d.leads === 1 ? '' : 's'}`}>
                    <span className="ads-dot" style={{ bottom: `${(d.leads / maxLeads) * 100}%` }} />
                    <span className={cn('ads-bar', !d.meta && 'is-old')} style={{ height: `${(Number(d.spend_gst) / maxDay) * 100}%` }} />
                  </div>
                ))}
              </div>
              <div className="row-between muted small">
                <span>{fbDays[0].day}</span>
                <span>{fbDays[fbDays.length - 1].day}</span>
              </div>
            </div>
          )}

          {/* per ad */}
          {r.ads.length > 0 && (
            <Paged rows={r.ads}>
              {(rows) => (
                <div className="table-wrap">
                  <table className="table table-compact">
                    <thead>
                      <tr>
                        <th>Campaign · Ad set · Ad</th>
                        <th className="num">Spend</th>
                        <th className="num">Impressions</th>
                        <th className="num">Link clicks</th>
                        <th className="num">Facebook leads</th>
                        <th className="num">Leads here</th>
                        <th className="num">Won</th>
                        <th className="num">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((a) => (
                        <tr key={a.ad_id}>
                          <td style={{ maxWidth: 340 }}>
                            <b>{a.ad_name ?? a.ad_id}</b>
                            <div className="muted small">
                              {a.campaign_name ?? a.campaign_id} · {a.adset_name ?? a.adset_id}
                            </div>
                          </td>
                          <td className="num nowrap">
                            <GstMoney ex={Number(a.spend)} inc={Number(a.spend_gst)} />
                          </td>
                          <td className="num">{num(a.impressions)}</td>
                          <td className="num">{num(a.link_clicks)}</td>
                          <td className="num">{num(a.meta_leads)}</td>
                          <td className="num">{num(a.leads)}</td>
                          <td className="num">{num(a.won)}</td>
                          <td className="num">{a.revenue ? inr(a.revenue) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Paged>
          )}
        </>
      )}
    </section>
  )
}
