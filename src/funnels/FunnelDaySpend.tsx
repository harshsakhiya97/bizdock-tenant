import { Fragment, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChartLine, ChevronDown, ChevronRight, Columns3, List } from 'lucide-react'
import { useTenant } from '@/tenant/useTenant'
import { funnelDaySpend, type AdAccount, type AdSet, type Campaign } from '@/meta/api'
import { SpendLines, type Line } from './SpendLines'
import { AdPreviewDrawer } from '@/meta/AdPreviewDrawer'
import { GoogleAdDrawer } from '@/google/GoogleAdDrawer'
import { funnelGoogleAdDays, type GAd, type GCampaign } from '@/google/api'
import { DateRangePicker, presetRange, type Range } from '@/components/DateRange'

const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (d: Date) => d.toLocaleDateString('en-CA')
const dt = (s: string) => new Date(`${s}T00:00:00`)
const short = (s: string) => dt(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

type By = 'date' | 'campaign' | 'adset' | 'ad'
type Period = 'day' | 'week' | 'month'
type Col = 'ads' | 'spend' | 'gst'
type SortKey = 'name' | 'ads' | 'spend'

type Ad = { ad_id: string; name: string; account: string; campaign: string; adset: string; spend: number; gst: number }
/** one report row: a period (date view) or a campaign / ad set / ad */
type Row = { key: string; name: string; sub: string; ads: Set<string>; spend: number; gst: number; items: Ad[]; ad?: Ad }

const BY: { key: By; label: string }[] = [
  { key: 'date', label: 'Date' },
  { key: 'campaign', label: 'Campaign' },
  { key: 'adset', label: 'Ad set' },
  { key: 'ad', label: 'Ad' },
]
const COLS: { key: Col; label: string }[] = [
  { key: 'ads', label: 'Ads' },
  { key: 'spend', label: 'Spend (without GST)' },
  { key: 'gst', label: 'Spend + GST' },
]

/** the period a day falls in: the day, its week (Sunday–Saturday: the Sunday) or its month (the 1st) */
function periodOf(d: string, p: Period) {
  if (p === 'day') return d
  if (p === 'month') return `${d.slice(0, 7)}-01`
  const x = dt(d)
  x.setDate(x.getDate() - x.getDay())
  return day(x)
}
function periodLabel(k: string, p: Period) {
  if (p === 'day') return dt(k).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  if (p === 'month') return dt(k).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  const end = dt(k)
  end.setDate(end.getDate() + 6)
  return `${short(k)} – ${end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
}
function stored<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}
function store(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* private window: not remembered */
  }
}

/**
 * Funnel → Facebook / Google Ads: the linked campaigns' spend report. View by Date (day / week Sun–Sat / month, each
 * row opens its ads), Campaign, Ad set or Ad; graph or list; sortable; columns can be hidden (remembered here).
 */
export function FunnelDaySpend({
  links,
  accounts,
  campaigns,
  adsets,
  google,
}: {
  links: { campaign_id: string; adset_id: string | null }[]
  /** name: shown before the campaign (account · campaign · ad set) */
  accounts: (Pick<AdAccount, 'id' | 'gst_rate'> & { name?: string | null })[]
  campaigns: Pick<Campaign, 'campaign_id' | 'name'>[]
  adsets: Pick<AdSet, 'adset_id' | 'name'>[]
  /** Google Ads (Funnel → Google Ads): its ads (for the preview); else Facebook */
  google?: { ads: GAd[]; customers?: Map<string, string>; campaigns?: GCampaign[] }
}) {
  const platform = google ? 'Google' : 'Facebook'
  const setWord = google ? 'Ad group' : 'Ad set'
  const tenant = useTenant()
  // same presets as Facebook Ads Manager (Last 30 days ends yesterday)
  const [range, setRange] = useState<Range>(() => presetRange('last30'))
  const { from, to } = range
  const [preview, setPreview] = useState<{ id: string; name: string | null; sub: string } | null>(null)
  const [gPreview, setGPreview] = useState<{ ad: GAd; sub: string } | null>(null)
  const [view, setView] = useState<'graph' | 'list'>(() => stored('spend:view', 'list'))
  const [by, setBy] = useState<By>(() => stored('spend:by', 'date'))
  const [period, setPeriod] = useState<Period>(() => stored('spend:period', 'day'))
  const [cols, setCols] = useState<Record<Col, boolean>>(() => ({ ads: true, spend: true, gst: false, ...stored('spend:cols', {}) }))
  const [sort, setSort] = useState<{ k: SortKey; desc: boolean } | null>(null)
  const [data, setData] = useState<{ days: { day: string; account_id: string; campaign_id: string; adset_id: string; ad_id: string; spend: number }[]; ads: Map<string, string>; objs?: Map<string, GAd> } | null>(null)
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

  // each spend row (day × ad) with its names and GST
  const facts = useMemo(() => {
    const gst = new Map(accounts.map((a) => [a.id, Number(a.gst_rate)]))
    const aName = new Map(accounts.map((a) => [a.id, a.name ?? '']))
    const cName = new Map(campaigns.map((c) => [c.campaign_id, c.name ?? c.campaign_id]))
    const sName = new Map(adsets.map((s) => [s.adset_id, s.name ?? s.adset_id]))
    return (data?.days ?? [])
      .filter((r) => Number(r.spend) > 0)
      .map((r) => {
        const sp = Number(r.spend)
        return {
          ...r,
          spend: sp,
          gst: sp * (1 + (gst.get(r.account_id) ?? 18) / 100),
          account: aName.get(r.account_id) ?? '',
          campaign: cName.get(r.campaign_id) ?? r.campaign_id,
          adset: sName.get(r.adset_id) ?? r.adset_id,
          name: data?.ads.get(r.ad_id) ?? r.ad_id,
        }
      })
  }, [data, accounts, campaigns, adsets])

  const rows = useMemo(() => {
    const m = new Map<string, Row>()
    for (const f of facts) {
      const k = by === 'date' ? periodOf(f.day, period) : by === 'campaign' ? f.campaign_id : by === 'adset' ? `${f.campaign_id}|${f.adset_id}` : f.ad_id
      const r =
        m.get(k) ??
        ({
          key: k,
          name: by === 'date' ? periodLabel(k, period) : by === 'campaign' ? f.campaign : by === 'adset' ? f.adset : f.name,
          sub: by === 'campaign' ? f.account : by === 'adset' ? [f.account, f.campaign].filter(Boolean).join(' · ') : by === 'ad' ? [f.account, f.campaign, f.adset].filter(Boolean).join(' · ') : '',
          ads: new Set<string>(),
          spend: 0,
          gst: 0,
          items: [],
        } as Row)
      r.ads.add(f.ad_id)
      r.spend += f.spend
      r.gst += f.gst
      if (by === 'ad') r.ad = { ad_id: f.ad_id, name: f.name, account: f.account, campaign: f.campaign, adset: f.adset, spend: 0, gst: 0 }
      if (by === 'date') {
        const a = r.items.find((x) => x.ad_id === f.ad_id)
        if (a) (a.spend += f.spend), (a.gst += f.gst)
        else r.items.push({ ad_id: f.ad_id, name: f.name, account: f.account, campaign: f.campaign, adset: f.adset, spend: f.spend, gst: f.gst })
      }
      m.set(k, r)
    }
    const list = [...m.values()]
    for (const r of list) r.items.sort((a, b) => b.spend - a.spend)
    const s = sort ?? (by === 'date' ? { k: 'name' as SortKey, desc: true } : { k: 'spend' as SortKey, desc: true })
    const val = (r: Row) => (s.k === 'spend' ? r.spend : s.k === 'ads' ? r.ads.size : by === 'date' ? r.key : r.name.toLowerCase())
    list.sort((a, b) => {
      const x = val(a)
      const y = val(b)
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
      return s.desc ? -c : c
    })
    return list
  }, [facts, by, period, sort])

  // the date graph: one line per campaign over the periods (top 8 + the rest)
  const chart = useMemo(() => {
    if (!facts.length) return { days: [] as string[], lines: [] as Line[] }
    const first = facts.reduce((mn, r) => (r.day < mn ? r.day : mn), facts[0].day)
    const last = facts.reduce((mx, r) => (r.day > mx ? r.day : mx), facts[0].day)
    const axis: string[] = []
    for (let d = dt(first); day(d) <= last; d.setDate(d.getDate() + 1)) {
      const p = periodOf(day(d), period)
      if (axis[axis.length - 1] !== p) axis.push(p)
    }
    const at = new Map(axis.map((d, i) => [d, i]))
    const series = new Map<string, Line>()
    for (const r of facts) {
      const l = series.get(r.campaign_id) ?? { key: r.campaign_id, name: r.campaign, values: axis.map(() => 0) }
      l.values[at.get(periodOf(r.day, period))!] += r.spend
      series.set(r.campaign_id, l)
    }
    const sum = (l: Line) => l.values.reduce((a, b) => a + b, 0)
    const sorted = [...series.values()].sort((a, b) => sum(b) - sum(a))
    if (sorted.length > 9) {
      const rest = sorted.slice(8)
      return { days: axis, lines: [...sorted.slice(0, 8), { key: 'other', name: `Other ${rest.length} campaigns`, values: axis.map((_, i) => rest.reduce((t, l) => t + l.values[i], 0)) }] }
    }
    return { days: axis, lines: sorted }
  }, [facts, period])

  const total = rows.reduce((t, r) => ({ spend: t.spend + r.spend, gst: t.gst + r.gst }), { spend: 0, gst: 0 })
  const allAds = new Set(facts.map((f) => f.ad_id)).size
  const money = (ex: number, inc: number) => (
    <span className="gst-hover" title={`${inr(ex)} + GST ${inr(inc - ex)} = ${inr(inc)} with GST`}>
      {inr(ex)}
    </span>
  )
  const pick = <T,>(set: (v: T) => void, k: string) => (v: T) => (set(v), store(k, v))
  const nameHead = by === 'date' ? (period === 'day' ? 'Day' : period === 'week' ? 'Week (Sun–Sat)' : 'Month') : by === 'campaign' ? 'Campaign' : by === 'adset' ? setWord : 'Ad'
  const head = (k: SortKey, label: string, num?: boolean) => {
    const on = sort?.k === k
    return (
      <th className={num ? 'num' : undefined} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => setSort({ k, desc: on ? !sort!.desc : k !== 'name' })}>
        {label} {on && (sort!.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
      </th>
    )
  }
  function openAd(a: Ad) {
    const sub = [a.account, a.campaign, a.adset].filter(Boolean).join(' · ')
    if (!google) return setPreview({ id: a.ad_id, name: a.name, sub })
    const o = data?.objs?.get(a.ad_id)
    if (o) return setGPreview({ ad: o, sub })
    // Performance Max (no ads): the campaign's panel (its type, status and Open in Google Ads)
    const r = data?.days.find((x) => x.ad_id === a.ad_id)
    const c = google.campaigns?.find((x) => x.campaign_id === r?.campaign_id)
    if (r)
      setGPreview({
        ad: { ad_id: '', ad_group_id: '', campaign_id: r.campaign_id, account_id: r.account_id, name: c?.name ?? a.campaign, type: c?.channel ?? null, status: c?.status ?? null, final_urls: [], headlines: [], descriptions: [] },
        sub: `${a.campaign} · spend not split by ad`,
      })
  }
  const top = rows.slice().sort((a, b) => b.spend - a.spend).slice(0, 10)
  const max = top[0]?.spend || 1

  return (
    <section className="card card-pad stack" style={{ gap: 12 }}>
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div>
          <b>Spend report</b>
          <div className="muted small">
            The linked campaigns’ {platform} spend, without GST (hover: + GST).{rows.length ? ' Total ' : ' '}
            {rows.length ? money(total.spend, total.gst) : null}
          </div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <DateRangePicker value={range} onChange={setRange} />
          <div className="seg" role="group" aria-label="View">
            <button type="button" className={view === 'graph' ? 'is-active' : undefined} onClick={() => pick(setView, 'spend:view')('graph')} title="Graph">
              <ChartLine size={15} /> Graph
            </button>
            <button type="button" className={view === 'list' ? 'is-active' : undefined} onClick={() => pick(setView, 'spend:view')('list')} title="List">
              <List size={15} /> List
            </button>
          </div>
        </div>
      </div>

      <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span className="muted small">View by</span>
          <div className="seg seg-sm" role="group" aria-label="View by">
            {BY.map((b) => (
              <button key={b.key} type="button" className={by === b.key ? 'is-active' : undefined} onClick={() => (pick(setBy, 'spend:by')(b.key), setSort(null), setOpen(new Set()))}>
                {b.key === 'adset' ? setWord : b.label}
              </button>
            ))}
          </div>
          {by === 'date' && (
            <div className="seg seg-sm" role="group" aria-label="Period">
              {(['day', 'week', 'month'] as Period[]).map((p) => (
                <button key={p} type="button" className={period === p ? 'is-active' : undefined} onClick={() => (pick(setPeriod, 'spend:period')(p), setOpen(new Set()))}>
                  {p === 'day' ? 'Day' : p === 'week' ? 'Week' : 'Month'}
                </button>
              ))}
            </div>
          )}
        </div>
        {view === 'list' && (
          <details className="col-menu">
            <summary className="btn btn-ghost btn-sm">
              <Columns3 size={14} /> Columns
            </summary>
            <div className="col-menu-pop card">
              {COLS.map((c) => (
                <label key={c.key} className="row" style={{ gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={cols[c.key]}
                    onChange={() => {
                      const n = { ...cols, [c.key]: !cols[c.key] }
                      setCols(n)
                      store('spend:cols', n)
                    }}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </details>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {!data && !error ? (
        <div className="muted small">Loading…</div>
      ) : !rows.length ? (
        <div className="muted small">No spend on the linked campaigns in these dates.</div>
      ) : view === 'graph' ? (
        by === 'date' ? (
          <div className="stack" style={{ gap: 8 }}>
            <span className="muted small">Spend per {period} without GST, one line per campaign · click a name below to hide / show its line</span>
            <SpendLines key={period} days={chart.days} lines={chart.lines} labelOf={(k) => (period === 'day' ? short(k) : period === 'week' ? `Week of ${short(k)}` : dt(k).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }))} />
          </div>
        ) : (
          <div className="stack" style={{ gap: 6 }}>
            <span className="muted small">Top {top.length} by spend, without GST</span>
            {top.map((r) => (
              <div key={r.key} className="spend-bar" title={`${r.name}${r.sub ? ` — ${r.sub}` : ''}`}>
                <div className="spend-bar-name">
                  {r.name}
                  {r.sub && <span className="muted small"> · {r.sub}</span>}
                </div>
                <div className="spend-bar-track">
                  <div className="spend-bar-fill" style={{ width: `${Math.max(2, (r.spend / max) * 100)}%` }} />
                </div>
                <div className="num nowrap">{money(r.spend, r.gst)}</div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="table-wrap">
          <table className="table table-compact">
            <thead>
              <tr>
                {head('name', nameHead)}
                {cols.ads && head('ads', 'Ads', true)}
                {cols.spend && head('spend', 'Spend', true)}
                {cols.gst && head('spend', 'Spend + GST', true)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isOpen = open.has(r.key)
                return (
                  <Fragment key={r.key}>
                    <tr
                      className="is-clickable"
                      title={by === 'ad' ? 'See the ad' : by === 'date' ? 'Show its ads' : undefined}
                      onClick={() => {
                        if (by === 'ad' && r.ad) return openAd(r.ad)
                        if (by !== 'date') return
                        setOpen((o) => {
                          const n = new Set(o)
                          if (n.has(r.key)) n.delete(r.key)
                          else n.add(r.key)
                          return n
                        })
                      }}
                    >
                      <td>
                        <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                          {by === 'date' && (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                          {by === 'date' ? <b>{r.name}</b> : <span>{r.name}</span>}
                        </span>
                        {r.sub && <div className="muted small">{r.sub}</div>}
                      </td>
                      {cols.ads && <td className="num muted">{r.ads.size}</td>}
                      {cols.spend && (
                        <td className="num nowrap">
                          <b>{money(r.spend, r.gst)}</b>
                        </td>
                      )}
                      {cols.gst && <td className="num nowrap">{inr(r.gst)}</td>}
                    </tr>
                    {isOpen &&
                      r.items.map((a) => (
                        <tr key={`${r.key}-${a.ad_id}`} className="is-clickable" title="See the ad" onClick={() => openAd(a)}>
                          <td style={{ paddingLeft: 32 }}>
                            {a.name}
                            {<div className="muted small">{[a.account, a.campaign, a.adset].filter(Boolean).join(' · ')}</div>}
                          </td>
                          {cols.ads && <td />}
                          {cols.spend && <td className="num nowrap">{money(a.spend, a.gst)}</td>}
                          {cols.gst && <td className="num nowrap">{inr(a.gst)}</td>}
                        </tr>
                      ))}
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>
                  <b>Total</b> <span className="muted small">· {rows.length} row{rows.length === 1 ? '' : 's'}</span>
                </td>
                {cols.ads && <td className="num">{allAds}</td>}
                {cols.spend && (
                  <td className="num nowrap">
                    <b>{money(total.spend, total.gst)}</b>
                  </td>
                )}
                {cols.gst && (
                  <td className="num nowrap">
                    <b>{inr(total.gst)}</b>
                  </td>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {preview && <AdPreviewDrawer ad={preview} onClose={() => setPreview(null)} />}
      {gPreview && <GoogleAdDrawer ad={gPreview.ad} sub={gPreview.sub} customerId={google?.customers?.get(gPreview.ad.account_id)} onClose={() => setGPreview(null)} />}
    </section>
  )
}
