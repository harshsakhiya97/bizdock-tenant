import { Fragment, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChartLine, ChevronDown, ChevronRight, List } from 'lucide-react'
import { useTenant } from '@/tenant/useTenant'
import { db } from '@/lib/supabase'
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
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

type By = 'date' | 'campaign' | 'adset' | 'ad'
type Period = 'day' | 'week' | 'month'
type SortKey = 'name' | 'spend' | 'leads' | 'warm' | 'ni' | 'closed'

type Fact = { day: string; account_id: string; campaign_id: string; adset_id: string; ad_id: string; spend: number; gst: number; account: string; campaign: string; adset: string; name: string }
type Ad = { ad_id: string; name: string; account: string; campaign: string; adset: string; spend: number; gst: number }
type Counts = { leads: number; warm: number; ni: number; closed: number }
/** one report row: a period (Date) or a campaign / ad set / ad */
type Row = Counts & { key: string; name: string; sub: string; spend: number; gst: number; items: Ad[]; ad?: Ad }
/** the funnel's leads per day and ad (funnel_ad_lead_counts) */
type LeadCount = { day: string; campaign: string | null; adset: string | null; ad: string | null; leads: number; warm: number; not_interested: number; closed: number }

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

/** the rows of one report: spend from the ads, leads matched by the ad they came from (names), or by lead date */
function buildRows(by: By, period: Period, facts: Fact[], counts: LeadCount[]) {
  const m = new Map<string, Row>()
  for (const f of facts) {
    const k = by === 'date' ? periodOf(f.day, period) : by === 'campaign' ? f.campaign_id : by === 'adset' ? `${f.campaign_id}|${f.adset_id}` : f.ad_id
    const r =
      m.get(k) ??
      ({
        key: k,
        name: by === 'date' ? periodLabel(k, period) : by === 'campaign' ? f.campaign : by === 'adset' ? f.adset : f.name,
        sub: by === 'campaign' ? f.account : by === 'adset' ? [f.account, f.campaign].filter(Boolean).join(' · ') : by === 'ad' ? [f.account, f.campaign, f.adset].filter(Boolean).join(' · ') : '',
        spend: 0,
        gst: 0,
        leads: 0,
        warm: 0,
        ni: 0,
        closed: 0,
        items: [],
      } as Row)
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
  // which row a lead belongs to (the first row with its names)
  const idx = new Map<string, string>()
  const put = (k: string, v: string) => !idx.has(k) && idx.set(k, v)
  for (const f of facts) {
    const c = norm(f.campaign)
    const s = norm(f.adset)
    const a = norm(f.name)
    if (by === 'campaign') put(c, f.campaign_id)
    if (by === 'adset') (put(`${c}|${s}`, `${f.campaign_id}|${f.adset_id}`), put(`|${s}`, `${f.campaign_id}|${f.adset_id}`))
    if (by === 'ad') (put(`${c}|${s}|${a}`, f.ad_id), put(`${c}||${a}`, f.ad_id), put(`||${a}`, f.ad_id))
  }
  for (const x of counts) {
    const c = norm(x.campaign)
    const s = norm(x.adset)
    const a = norm(x.ad)
    let k: string | undefined
    if (by === 'date') {
      k = periodOf(x.day, period)
      if (!m.has(k)) m.set(k, { key: k, name: periodLabel(k, period), sub: '', spend: 0, gst: 0, leads: 0, warm: 0, ni: 0, closed: 0, items: [] })
    } else if (by === 'campaign') k = c ? idx.get(c) : undefined
    else if (by === 'adset') k = s ? (idx.get(`${c}|${s}`) ?? (c ? undefined : idx.get(`|${s}`))) : undefined
    else k = a ? (idx.get(`${c}|${s}|${a}`) ?? idx.get(`${c}||${a}`) ?? (c ? undefined : idx.get(`||${a}`))) : undefined
    const r = k ? m.get(k) : undefined
    if (!r) continue
    r.leads += x.leads
    r.warm += x.warm
    r.ni += x.not_interested
    r.closed += x.closed
  }
  const list = [...m.values()]
  for (const r of list) r.items.sort((a, b) => b.spend - a.spend)
  return list
}

/**
 * Funnel → Facebook / Google Ads: Date, Campaign, Ad set and Ads Performance — each a ranked table (spend, leads, warm,
 * not interested, closed) or a graph, for one date range. Date: day / week (Sun–Sat) / month, each row opens its ads.
 */
export function FunnelDaySpend({
  funnelId,
  links,
  accounts,
  campaigns,
  adsets,
  google,
}: {
  funnelId: string
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
  const [data, setData] = useState<{ days: { day: string; account_id: string; campaign_id: string; adset_id: string; ad_id: string; spend: number }[]; ads: Map<string, string>; objs?: Map<string, GAd> } | null>(null)
  const [counts, setCounts] = useState<LeadCount[]>([])
  const [error, setError] = useState<string | null>(null)
  const key = JSON.stringify(links)

  useEffect(() => {
    setData(null)
    setError(null)
    const ls = JSON.parse(key) as { campaign_id: string }[]
    const ask = google
      ? funnelGoogleAdDays(tenant.id, [...new Set(ls.map((l) => l.campaign_id))], from, to, google.ads, new Map(campaigns.map((c) => [c.campaign_id, c.name ?? c.campaign_id])))
      : funnelDaySpend(tenant.id, JSON.parse(key), from, to)
    ask.then(setData, (e: Error) => setError(e.message))
    db()
      .rpc('funnel_ad_lead_counts', { p_funnel: funnelId, p_from: from, p_to: to })
      .then(({ data: c, error: e }) => (e ? setError(e.message) : setCounts((c ?? []) as LeadCount[])))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant.id, key, from, to, !!google, funnelId])

  // each spend row (day × ad) with its names and GST
  const facts = useMemo<Fact[]>(() => {
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
  const total = facts.reduce((t, f) => ({ spend: t.spend + f.spend, gst: t.gst + f.gst }), { spend: 0, gst: 0 })

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
  const card = { facts, counts, view, platform, openAd }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="card card-pad">
        <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div>
            <b>Ads performance</b>
            <div className="muted small">
              The linked campaigns’ {platform} spend, without GST (hover: + GST), and the funnel’s leads by the ad they came from.
              {facts.length ? (
                <>
                  {' '}
                  Total{' '}
                  <span className="gst-hover" title={`${inr(total.spend)} + GST ${inr(total.gst - total.spend)} = ${inr(total.gst)} with GST`}>
                    {inr(total.spend)}
                  </span>
                </>
              ) : null}
            </div>
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <DateRangePicker value={range} onChange={setRange} />
            <div className="seg" role="group" aria-label="View">
              <button type="button" className={view === 'graph' ? 'is-active' : undefined} onClick={() => (setView('graph'), store('spend:view', 'graph'))} title="Graph">
                <ChartLine size={15} /> Graph
              </button>
              <button type="button" className={view === 'list' ? 'is-active' : undefined} onClick={() => (setView('list'), store('spend:view', 'list'))} title="List">
                <List size={15} /> List
              </button>
            </div>
          </div>
        </div>
        {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
        {!data && !error && <div className="muted small" style={{ marginTop: 10 }}>Loading…</div>}
      </section>
      {data && (
        <>
          <PerfCard by="date" title="Date Performance" {...card} />
          <PerfCard by="campaign" title="Campaign Performance" {...card} />
          <PerfCard by="adset" title={`${setWord} Performance`} {...card} />
          <PerfCard by="ad" title="Ads Performance" {...card} />
        </>
      )}
      {preview && <AdPreviewDrawer ad={preview} onClose={() => setPreview(null)} />}
      {gPreview && <GoogleAdDrawer ad={gPreview.ad} sub={gPreview.sub} customerId={google?.customers?.get(gPreview.ad.account_id)} onClose={() => setGPreview(null)} />}
    </div>
  )
}

/** one ranked report (or its graph) */
function PerfCard({ by, title, facts, counts, view, platform, openAd }: { by: By; title: string; facts: Fact[]; counts: LeadCount[]; view: 'graph' | 'list'; platform: string; openAd: (a: Ad) => void }) {
  const [period, setPeriod] = useState<Period>(() => stored('spend:period', 'day'))
  const [sort, setSort] = useState<{ k: SortKey; desc: boolean } | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())

  const rows = useMemo(() => {
    const list = buildRows(by, period, facts, counts).filter((r) => r.spend > 0 || r.leads > 0)
    const s = sort ?? (by === 'date' ? { k: 'name' as SortKey, desc: true } : { k: 'spend' as SortKey, desc: true })
    const val = (r: Row): number | string => (s.k === 'name' ? (by === 'date' ? r.key : r.name.toLowerCase()) : s.k === 'ni' ? r.ni : r[s.k])
    list.sort((a, b) => {
      const x = val(a)
      const y = val(b)
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
      return s.desc ? -c : c
    })
    return list
  }, [by, period, facts, counts, sort])
  const rank = useMemo(() => new Map([...rows].sort((a, b) => b.spend - a.spend).map((r, i) => [r.key, i + 1])), [rows])
  const tot = rows.reduce((t, r) => ({ spend: t.spend + r.spend, gst: t.gst + r.gst, leads: t.leads + r.leads, warm: t.warm + r.warm, ni: t.ni + r.ni, closed: t.closed + r.closed }), { spend: 0, gst: 0, leads: 0, warm: 0, ni: 0, closed: 0 })

  // Date graph: one line per campaign over the periods (top 8 + the rest)
  const chart = useMemo(() => {
    if (by !== 'date' || !facts.length) return { days: [] as string[], lines: [] as Line[] }
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
  }, [by, facts, period])
  const top = [...rows].sort((a, b) => b.spend - a.spend).slice(0, 10)
  const max = top[0]?.spend || 1

  const money = (ex: number, inc: number) => (
    <span className="gst-hover" title={`${inr(ex)} + GST ${inr(inc - ex)} = ${inr(inc)} with GST`}>
      {inr(ex)}
    </span>
  )
  const head = (k: SortKey, label: string, num = true) => {
    const on = sort?.k === k
    return (
      <th className={num ? 'num' : undefined} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => setSort({ k, desc: on ? !sort!.desc : k !== 'name' })}>
        {label} {on && (sort!.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
      </th>
    )
  }
  const nameHead = by === 'date' ? (period === 'day' ? 'Day' : period === 'week' ? 'Week (Sun–Sat)' : 'Month') : 'Name'

  return (
    <section className="card card-pad stack" style={{ gap: 12 }}>
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="row" style={{ gap: 8 }}>
          <b>{title}</b>
          <span className="badge badge-muted">{platform}</span>
        </div>
        {by === 'date' && (
          <div className="seg seg-sm" role="group" aria-label="Period">
            {(['day', 'week', 'month'] as Period[]).map((p) => (
              <button key={p} type="button" className={period === p ? 'is-active' : undefined} onClick={() => (setPeriod(p), store('spend:period', p), setOpen(new Set()))}>
                {p === 'day' ? 'Day' : p === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>
        )}
      </div>
      {!rows.length ? (
        <div className="muted small">No spend or leads in these dates.</div>
      ) : view === 'graph' ? (
        by === 'date' ? (
          <SpendLines key={period} days={chart.days} lines={chart.lines} labelOf={(k) => (period === 'day' ? short(k) : period === 'week' ? `Week of ${short(k)}` : dt(k).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }))} />
        ) : (
          <div className="stack" style={{ gap: 6 }}>
            <span className="muted small">Top {top.length} by spend, without GST</span>
            {top.map((r) => (
              <div key={r.key} className="spend-bar" title={`${r.name}${r.sub ? ` — ${r.sub}` : ''}`}>
                <div className="spend-bar-name">
                  {r.name}
                  <span className="muted small"> · {r.leads} lead{r.leads === 1 ? '' : 's'}</span>
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
                {by !== 'date' && <th style={{ width: 56 }}>Rank</th>}
                {head('name', nameHead, false)}
                {head('spend', 'Spend')}
                {head('leads', 'Leads')}
                {head('warm', 'Warm')}
                {head('ni', 'Not Interested')}
                {head('closed', 'Closed')}
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
                      {by !== 'date' && <td className="muted">#{rank.get(r.key)}</td>}
                      <td>
                        <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                          {by === 'date' && (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                          {by === 'date' ? <b>{r.name}</b> : <span>{r.name}</span>}
                        </span>
                        {r.sub && <div className="muted small">{r.sub}</div>}
                      </td>
                      <td className="num nowrap">
                        <b>{money(r.spend, r.gst)}</b>
                      </td>
                      <td className="num">{r.leads}</td>
                      <td className="num">{r.warm}</td>
                      <td className="num">{r.ni}</td>
                      <td className="num">{r.closed}</td>
                    </tr>
                    {isOpen &&
                      r.items.map((a) => (
                        <tr key={`${r.key}-${a.ad_id}`} className="is-clickable" title="See the ad" onClick={() => openAd(a)}>
                          <td style={{ paddingLeft: 32 }}>
                            {a.name}
                            <div className="muted small">{[a.account, a.campaign, a.adset].filter(Boolean).join(' · ')}</div>
                          </td>
                          <td className="num nowrap">{money(a.spend, a.gst)}</td>
                          <td colSpan={4} />
                        </tr>
                      ))}
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                {by !== 'date' && <td />}
                <td>
                  <b>Total</b> <span className="muted small">· {rows.length} row{rows.length === 1 ? '' : 's'}</span>
                </td>
                <td className="num nowrap">
                  <b>{money(tot.spend, tot.gst)}</b>
                </td>
                <td className="num">
                  <b>{tot.leads}</b>
                </td>
                <td className="num">
                  <b>{tot.warm}</b>
                </td>
                <td className="num">
                  <b>{tot.ni}</b>
                </td>
                <td className="num">
                  <b>{tot.closed}</b>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}
