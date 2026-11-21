import { Fragment, useEffect, useMemo, useState } from 'react'
import { ChartLine, ChevronDown, ChevronRight, List } from 'lucide-react'
import { useTenant } from '@/tenant/useTenant'
import { funnelDaySpend, type AdAccount, type AdSet, type Campaign } from '@/meta/api'
import { SpendLines, type Line } from './SpendLines'
import { AdPreviewDrawer } from '@/meta/AdPreviewDrawer'
import { GoogleAdDrawer } from '@/google/GoogleAdDrawer'
import { funnelGoogleAdDays, type GAd } from '@/google/api'
import { DateRangePicker, presetRange, type Range } from '@/components/DateRange'

const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (d: Date) => d.toLocaleDateString('en-CA')

type Ad = { ad_id: string; name: string; campaign: string; adset: string; spend: number; gst: number }
type Day = { day: string; spend: number; gst: number; ads: Ad[] }

/** Funnel → Facebook Ads: the linked campaigns' spend per day (without GST, hover with), and each day's ads with their spend. */
export function FunnelDaySpend({
  links,
  accounts,
  campaigns,
  adsets,
  google,
}: {
  links: { campaign_id: string; adset_id: string | null }[]
  accounts: Pick<AdAccount, 'id' | 'gst_rate'>[]
  campaigns: Pick<Campaign, 'campaign_id' | 'name'>[]
  adsets: Pick<AdSet, 'adset_id' | 'name'>[]
  /** Google Ads (Funnel → Google Ads): its ads (for the preview); else Facebook */
  google?: { ads: GAd[] }
}) {
  const platform = google ? 'Google' : 'Facebook'
  const tenant = useTenant()
  // same presets as Facebook Ads Manager (Last 30 days ends yesterday)
  const [range, setRange] = useState<Range>(() => presetRange('last30'))
  const { from, to } = range
  // an ad's preview (side drawer), as in System Connections → Facebook → Ads
  const [preview, setPreview] = useState<{ id: string; name: string | null; sub: string } | null>(null)
  // graph (the lines) or list (each day, with its ads)
  const [view, setView] = useState<'graph' | 'list'>('graph')
  const [data, setData] = useState<{ days: { day: string; account_id: string; campaign_id: string; adset_id: string; ad_id: string; spend: number }[]; ads: Map<string, string>; objs?: Map<string, GAd> } | null>(null)
  const [gPreview, setGPreview] = useState<{ ad: GAd; sub: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const key = JSON.stringify(links)

  useEffect(() => {
    setData(null)
    setError(null)
    const ls = JSON.parse(key) as { campaign_id: string }[]
    const ask = google
      ? funnelGoogleAdDays(tenant.id, [...new Set(ls.map((l) => l.campaign_id))], from, to, google.ads, new Map(campaigns.map((c) => [c.campaign_id, c.name ?? c.campaign_id])))
      : funnelDaySpend(tenant.id, JSON.parse(key), from, to)
    ask.then(setData, (e: Error) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant.id, key, from, to, !!google])

  const days = useMemo(() => {
    const gst = new Map(accounts.map((a) => [a.id, Number(a.gst_rate)]))
    const cName = new Map(campaigns.map((c) => [c.campaign_id, c.name ?? c.campaign_id]))
    const sName = new Map(adsets.map((s) => [s.adset_id, s.name ?? s.adset_id]))
    const byDay = new Map<string, Day>()
    for (const r of data?.days ?? []) {
      const sp = Number(r.spend || 0)
      const g = sp * (1 + (gst.get(r.account_id) ?? 18) / 100)
      const d = byDay.get(r.day) ?? { day: r.day, spend: 0, gst: 0, ads: [] }
      d.spend += sp
      d.gst += g
      const ad = d.ads.find((a) => a.ad_id === r.ad_id)
      if (ad) {
        ad.spend += sp
        ad.gst += g
      } else d.ads.push({ ad_id: r.ad_id, name: data?.ads.get(r.ad_id) ?? r.ad_id, campaign: cName.get(r.campaign_id) ?? r.campaign_id, adset: sName.get(r.adset_id) ?? r.adset_id, spend: sp, gst: g })
      byDay.set(r.day, d)
    }
    return [...byDay.values()].filter((d) => d.spend > 0).map((d) => ({ ...d, ads: d.ads.filter((a) => a.spend > 0).sort((a, b) => b.spend - a.spend) })).sort((a, b) => b.day.localeCompare(a.day))
  }, [data, accounts, campaigns, adsets])
  // the graph: every day from the first to the last day with spend, one line per campaign or per ad (without GST)
  const [by, setBy] = useState<'campaign' | 'ad'>('campaign')
  const chart = useMemo(() => {
    const rows = (data?.days ?? []).filter((r) => Number(r.spend) > 0)
    if (!rows.length) return { days: [] as string[], lines: [] as Line[] }
    const first = rows.reduce((m, r) => (r.day < m ? r.day : m), rows[0].day)
    const last = rows.reduce((m, r) => (r.day > m ? r.day : m), rows[0].day)
    const axis: string[] = []
    for (let d = new Date(`${first}T00:00:00`); day(d) <= last; d.setDate(d.getDate() + 1)) axis.push(day(d))
    const at = new Map(axis.map((d, i) => [d, i]))
    const cName = new Map(campaigns.map((c) => [c.campaign_id, c.name ?? c.campaign_id]))
    const series = new Map<string, Line>()
    for (const r of rows) {
      const k = by === 'campaign' ? r.campaign_id : r.ad_id
      const l = series.get(k) ?? { key: k, name: by === 'campaign' ? (cName.get(k) ?? k) : (data?.ads.get(k) ?? k), values: axis.map(() => 0) }
      l.values[at.get(r.day)!] += Number(r.spend)
      series.set(k, l)
    }
    const sum = (l: Line) => l.values.reduce((a, b) => a + b, 0)
    const sorted = [...series.values()].sort((a, b) => sum(b) - sum(a))
    // many ads: the top 8, the rest as one "Other ads" line
    if (sorted.length > 9) {
      const rest = sorted.slice(8)
      return { days: axis, lines: [...sorted.slice(0, 8), { key: 'other', name: `Other ${rest.length} ${by === 'ad' ? 'ads' : 'campaigns'}`, values: axis.map((_, i) => rest.reduce((t, l) => t + l.values[i], 0)) }] }
    }
    return { days: axis, lines: sorted }
  }, [data, accounts, campaigns, by])
  const total = days.reduce((t, d) => ({ spend: t.spend + d.spend, gst: t.gst + d.gst }), { spend: 0, gst: 0 })
  const money = (ex: number, inc: number) => (
    <span className="gst-hover" title={`${inr(ex)} + GST ${inr(inc - ex)} = ${inr(inc)} with GST`}>
      {inr(ex)}
    </span>
  )

  return (
    <section className="card card-pad stack" style={{ gap: 12 }}>
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div>
          <b>Spend per day</b>
          <div className="muted small">
            The linked campaigns’ {platform} spend, without GST (hover: + GST).{days.length ? ` ${days.length} day${days.length === 1 ? '' : 's'} · ` : ' '}
            {days.length ? <>total {money(total.spend, total.gst)}</> : null}
          </div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <DateRangePicker value={range} onChange={setRange} />
          <div className="seg" role="group" aria-label="View">
            <button type="button" className={view === 'graph' ? 'is-active' : undefined} onClick={() => setView('graph')} title="Graph">
              <ChartLine size={15} /> Graph
            </button>
            <button type="button" className={view === 'list' ? 'is-active' : undefined} onClick={() => setView('list')} title="List">
              <List size={15} /> List
            </button>
          </div>
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {!data && !error ? (
        <div className="muted small">Loading…</div>
      ) : !days.length ? (
        <div className="muted small">No spend on the linked campaigns in these dates.</div>
      ) : (
        <>
        {view === 'graph' && <div className="stack" style={{ gap: 8 }}>
          <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
            <span className="muted small">Spend per day without GST · click a name below to hide / show its line</span>
            <div className="seg seg-sm" role="group" aria-label="Lines">
              <button type="button" className={by === 'campaign' ? 'is-active' : undefined} onClick={() => setBy('campaign')}>
                By campaign
              </button>
              <button type="button" className={by === 'ad' ? 'is-active' : undefined} onClick={() => setBy('ad')}>
                By ad
              </button>
            </div>
          </div>
          <SpendLines key={by} days={chart.days} lines={chart.lines} />
        </div>}
        {view === 'list' && (
            <div className="table-wrap">
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th style={{ width: 170 }}>Day</th>
                    <th>Ads</th>
                    <th className="num" style={{ width: 160 }}>
                      Spend
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => {
                    const isOpen = open.has(d.day)
                    return (
                      <Fragment key={d.day}>
                        <tr
                          className="is-clickable"
                          onClick={() =>
                            setOpen((o) => {
                              const n = new Set(o)
                              if (n.has(d.day)) n.delete(d.day)
                              else n.add(d.day)
                              return n
                            })
                          }
                        >
                          <td className="nowrap">
                            <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              <b>{d.day}</b>
                            </span>
                          </td>
                          <td className="muted small">
                            {d.ads.length} ad{d.ads.length === 1 ? '' : 's'}
                          </td>
                          <td className="num nowrap">
                            <b>{money(d.spend, d.gst)}</b>
                          </td>
                        </tr>
                        {isOpen &&
                          d.ads.map((a) => (
                            <tr key={`${d.day}-${a.ad_id}`} className="is-clickable" title="See the ad" onClick={() => {
                              if (!google) return setPreview({ id: a.ad_id, name: a.name, sub: `${a.campaign} · ${a.adset}` })
                              const o = data?.objs?.get(a.ad_id)
                              if (o) setGPreview({ ad: o, sub: `${a.campaign} · ${a.adset}` })
                            }}>
                              <td />
                              <td>
                                {a.name}
                                <div className="muted small">
                                  {a.campaign} · {a.adset}
                                </div>
                              </td>
                              <td className="num nowrap">{money(a.spend, a.gst)}</td>
                            </tr>
                          ))}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
        )}
        </>
      )}
      {preview && <AdPreviewDrawer ad={preview} onClose={() => setPreview(null)} />}
      {gPreview && <GoogleAdDrawer ad={gPreview.ad} sub={gPreview.sub} onClose={() => setGPreview(null)} />}
    </section>
  )
}
