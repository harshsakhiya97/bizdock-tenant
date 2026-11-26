import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, ChartNoAxesColumn, CheckCircle2, ChevronDown, ChevronRight, Lightbulb, Table2, TrendingUp } from 'lucide-react'
import { useTenant } from '@/tenant/useTenant'
import { db } from '@/lib/supabase'
import { funnelDaySpend, type AdAccount, type AdSet, type Campaign } from '@/meta/api'
import { AdPreviewDrawer } from '@/meta/AdPreviewDrawer'
import { GoogleAdDrawer } from '@/google/GoogleAdDrawer'
import { funnelGoogleAdDays, type GAd, type GCampaign } from '@/google/api'
import { DateRangePicker, presetRange, type Range } from '@/components/DateRange'

// ---------- helpers ----------
const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const inr0 = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`
const kshort = (n: number) => (n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `₹${Math.round(n)}`)
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0)
const day = (d: Date) => d.toLocaleDateString('en-CA')
const dt = (s: string) => new Date(`${s}T00:00:00`)
const short = (s: string) => dt(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
const addDays = (s: string, n: number) => {
  const d = dt(s)
  d.setDate(d.getDate() + n)
  return day(d)
}
const daysBetween = (a: string, b: string) => Math.round((dt(b).getTime() - dt(a).getTime()) / 86400000) + 1

/** lead quality colours */
const Q = { spend: 'var(--brand)', leads: '#0ea5e9', warm: '#f59e0b', ni: '#ef4444', closed: '#16a34a', other: '#cbd5e1' }
const PALETTE = ['#6366f1', '#0ea5e9', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#ec4899', '#84cc16', '#94a3b8']

type By = 'date' | 'campaign' | 'adset' | 'ad'
type Period = 'day' | 'week' | 'month'
type SortKey = 'name' | 'spend' | 'leads' | 'cpl' | 'warm' | 'ni' | 'closed'

type Fact = { day: string; account_id: string; campaign_id: string; adset_id: string; ad_id: string; spend: number; gst: number; account: string; campaign: string; adset: string; name: string }
type Ad = { ad_id: string; name: string; account: string; campaign: string; adset: string; spend: number; gst: number }
type Counts = { leads: number; warm: number; ni: number; closed: number }
/** one report row: a period (Date) or a campaign / ad set / ad */
type Row = Counts & { key: string; name: string; sub: string; spend: number; gst: number; items: Ad[]; ad?: Ad }
/** the funnel's leads per day and ad (funnel_ad_lead_counts) */
type LeadCount = { day: string; campaign: string | null; adset: string | null; ad: string | null; leads: number; warm: number; not_interested: number; closed: number }
type SpendDays = { days: { day: string; account_id: string; campaign_id: string; adset_id: string; ad_id: string; spend: number }[]; ads: Map<string, string>; objs?: Map<string, GAd> }

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
  return `${short(k)} – ${dt(addDays(k, 6)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
}
const axisLabel = (k: string, p: Period) => (p === 'month' ? dt(k).toLocaleDateString('en-IN', { month: 'short' }) : short(k))
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
function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(760)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

/** the rows of one report: spend from the ads, leads matched by the ad they came from (names), or by lead date */
function buildRows(by: By, period: Period, facts: Fact[], counts: LeadCount[]) {
  const m = new Map<string, Row>()
  const blank = (key: string, name: string, sub: string): Row => ({ key, name, sub, spend: 0, gst: 0, leads: 0, warm: 0, ni: 0, closed: 0, items: [] })
  for (const f of facts) {
    const k = by === 'date' ? periodOf(f.day, period) : by === 'campaign' ? f.campaign_id : by === 'adset' ? `${f.campaign_id}|${f.adset_id}` : f.ad_id
    const r =
      m.get(k) ??
      blank(
        k,
        by === 'date' ? periodLabel(k, period) : by === 'campaign' ? f.campaign : by === 'adset' ? f.adset : f.name,
        by === 'campaign' ? f.account : by === 'adset' ? [f.account, f.campaign].filter(Boolean).join(' · ') : by === 'ad' ? [f.account, f.campaign, f.adset].filter(Boolean).join(' · ') : '',
      )
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
      if (!m.has(k)) m.set(k, blank(k, periodLabel(k, period), ''))
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
  const list = [...m.values()].filter((r) => r.spend > 0 || r.leads > 0)
  for (const r of list) r.items.sort((a, b) => b.spend - a.spend)
  return list
}
const cpl = (r: { spend: number; leads: number }) => (r.leads ? r.spend / r.leads : Infinity)

function totals(facts: Fact[], counts: LeadCount[]) {
  const spend = facts.reduce((t, f) => t + f.spend, 0)
  const gst = facts.reduce((t, f) => t + f.gst, 0)
  const c = counts.reduce((t, x) => ({ leads: t.leads + x.leads, warm: t.warm + x.warm, ni: t.ni + x.not_interested, closed: t.closed + x.closed }), { leads: 0, warm: 0, ni: 0, closed: 0 })
  return { spend, gst, ...c }
}

// ---------- the dashboard ----------
/**
 * Funnel → Facebook / Google Ads: an insights dashboard for one date range — KPI tiles (vs the period before), insights,
 * lead quality, and Date / Campaign / Ad set / Ads Performance as charts (each with its table).
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
  // the period before, as long (for the ▲ ▼ on the tiles)
  const prevTo = addDays(from, -1)
  const prevFrom = addDays(prevTo, -(daysBetween(from, to) - 1))
  const [preview, setPreview] = useState<{ id: string; name: string | null; sub: string } | null>(null)
  const [gPreview, setGPreview] = useState<{ ad: GAd; sub: string } | null>(null)
  const [data, setData] = useState<SpendDays | null>(null)
  const [prev, setPrev] = useState<SpendDays | null>(null)
  const [counts, setCounts] = useState<LeadCount[]>([])
  const [prevCounts, setPrevCounts] = useState<LeadCount[]>([])
  const [error, setError] = useState<string | null>(null)
  const key = JSON.stringify(links)

  useEffect(() => {
    setData(null)
    setPrev(null)
    setError(null)
    const ls = JSON.parse(key) as { campaign_id: string; adset_id: string | null }[]
    const spendOf = (a: string, b: string) =>
      google
        ? funnelGoogleAdDays(tenant.id, [...new Set(ls.map((l) => l.campaign_id))], a, b, google.ads, new Map(campaigns.map((c) => [c.campaign_id, c.name ?? c.campaign_id])))
        : funnelDaySpend(tenant.id, ls, a, b)
    const leadsOf = (a: string, b: string) =>
      db()
        .rpc('funnel_ad_lead_counts', { p_funnel: funnelId, p_from: a, p_to: b })
        .then(({ data: c, error: e }) => {
          if (e) throw new Error(e.message)
          return (c ?? []) as LeadCount[]
        })
    Promise.all([spendOf(from, to), leadsOf(from, to)])
      .then(([s, c]) => (setCounts(c), setData(s)))
      .catch((e: Error) => setError(e.message))
    Promise.all([spendOf(prevFrom, prevTo), leadsOf(prevFrom, prevTo)])
      .then(([s, c]) => (setPrevCounts(c), setPrev(s)))
      .catch(() => setPrev(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant.id, key, from, to, !!google, funnelId])

  const factsOf = (d: SpendDays | null): Fact[] => {
    const gst = new Map(accounts.map((a) => [a.id, Number(a.gst_rate)]))
    const aName = new Map(accounts.map((a) => [a.id, a.name ?? '']))
    const cName = new Map(campaigns.map((c) => [c.campaign_id, c.name ?? c.campaign_id]))
    const sName = new Map(adsets.map((s) => [s.adset_id, s.name ?? s.adset_id]))
    return (d?.days ?? [])
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
          name: d?.ads.get(r.ad_id) ?? r.ad_id,
        }
      })
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facts = useMemo(() => factsOf(data), [data, accounts, campaigns, adsets])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const prevFacts = useMemo(() => factsOf(prev), [prev, accounts, campaigns, adsets])
  const now = useMemo(() => totals(facts, counts), [facts, counts])
  const before = useMemo(() => (prev ? totals(prevFacts, prevCounts) : null), [prev, prevFacts, prevCounts])
  const camps = useMemo(() => buildRows('campaign', 'day', facts, counts), [facts, counts])
  const sets = useMemo(() => buildRows('adset', 'day', facts, counts), [facts, counts])
  const ads = useMemo(() => buildRows('ad', 'day', facts, counts), [facts, counts])
  const insights = useMemo(() => makeInsights(now, before, camps, sets, ads, setWord), [now, before, camps, sets, ads, setWord])

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

  const tiles: { label: string; value: string; now: number; was: number | null; good: 'up' | 'down'; hint?: string; tone?: string }[] = [
    { label: 'Spend', value: inr0(now.spend), now: now.spend, was: before?.spend ?? null, good: 'down', hint: `${inr(now.gst)} with GST` },
    { label: 'Leads', value: String(now.leads), now: now.leads, was: before?.leads ?? null, good: 'up' },
    { label: 'Cost per lead', value: now.leads ? inr0(now.spend / now.leads) : '—', now: now.leads ? now.spend / now.leads : 0, was: before?.leads ? before.spend / before.leads : null, good: 'down' },
    { label: 'Warm', value: `${pct(now.warm, now.leads).toFixed(0)}%`, now: pct(now.warm, now.leads), was: before ? pct(before.warm, before.leads) : null, good: 'up', hint: `${now.warm} leads`, tone: Q.warm },
    { label: 'Not interested', value: `${pct(now.ni, now.leads).toFixed(0)}%`, now: pct(now.ni, now.leads), was: before ? pct(before.ni, before.leads) : null, good: 'down', hint: `${now.ni} leads`, tone: Q.ni },
    { label: 'Closed', value: String(now.closed), now: now.closed, was: before?.closed ?? null, good: 'up', hint: now.leads ? `${pct(now.closed, now.leads).toFixed(1)}% of leads` : undefined, tone: Q.closed },
    { label: 'Cost per closed', value: now.closed ? inr0(now.spend / now.closed) : '—', now: now.closed ? now.spend / now.closed : 0, was: before?.closed ? before.spend / before.closed : null, good: 'down' },
  ]

  return (
    <div className="adsd stack" style={{ gap: 16 }}>
      <section className="card card-pad adsd-head">
        <div>
          <b>Ads insights</b>
          <div className="muted small">
            {platform} spend of the linked campaigns (without GST) and the funnel’s leads by the ad they came from. ▲ ▼ compare with {short(prevFrom)} – {short(prevTo)}.
          </div>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </section>
      {error && <div className="alert alert-error">{error}</div>}
      {!data && !error ? (
        <div className="card card-pad muted small">Loading…</div>
      ) : data ? (
        <>
          <div className="adsd-kpis">
            {tiles.map((t) => (
              <Kpi key={t.label} {...t} />
            ))}
          </div>

          <div className="adsd-grid">
            <section className="card card-pad stack" style={{ gap: 10 }}>
              <div className="row" style={{ gap: 8 }}>
                <Lightbulb size={16} style={{ color: 'var(--brand)' }} />
                <b>Insights</b>
              </div>
              {insights.length ? (
                <div className="adsd-insights">
                  {insights.map((x, i) => (
                    <div key={i} className={`adsd-insight is-${x.tone}`}>
                      {x.tone === 'good' ? <CheckCircle2 size={15} /> : x.tone === 'bad' ? <AlertTriangle size={15} /> : <TrendingUp size={15} />}
                      <span>{x.text}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="muted small">Not enough data in these dates yet.</div>
              )}
            </section>
            <section className="card card-pad stack" style={{ gap: 10 }}>
              <b>Lead quality</b>
              <QualityFunnel t={now} />
            </section>
          </div>

          <DateCard facts={facts} counts={counts} platform={platform} openAd={openAd} />

          <PerfCard title="Campaign Performance" platform={platform} rows={camps} by="campaign" openAd={openAd}>
            <div className="adsd-split">
              <Donut rows={camps} />
              <QualityBars rows={camps} />
            </div>
          </PerfCard>

          <PerfCard title={`${setWord} Performance`} platform={platform} rows={sets} by="adset" openAd={openAd}>
            <ShareBars rows={sets} />
          </PerfCard>

          <PerfCard title="Ads Performance" platform={platform} rows={ads} by="ad" openAd={openAd}>
            <Leaderboard rows={ads} openAd={openAd} />
          </PerfCard>
        </>
      ) : null}
      {preview && <AdPreviewDrawer ad={preview} onClose={() => setPreview(null)} />}
      {gPreview && <GoogleAdDrawer ad={gPreview.ad} sub={gPreview.sub} customerId={google?.customers?.get(gPreview.ad.account_id)} onClose={() => setGPreview(null)} />}
    </div>
  )
}

// ---------- KPI tile ----------
function Kpi({ label, value, now, was, good, hint, tone }: { label: string; value: string; now: number; was: number | null; good: 'up' | 'down'; hint?: string; tone?: string }) {
  const ch = was != null && was > 0 && Number.isFinite(now) ? ((now - was) / was) * 100 : null
  const better = ch == null ? null : good === 'up' ? ch > 0 : ch < 0
  return (
    <div className="adsd-kpi" style={tone ? { ['--tone' as string]: tone } : undefined}>
      <span className="adsd-kpi-label">{label}</span>
      <span className="adsd-kpi-value">{value}</span>
      <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {ch != null && Math.abs(ch) >= 0.5 ? (
          <span className={`adsd-delta ${better ? 'is-good' : 'is-bad'}`}>
            {ch > 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
            {Math.abs(ch).toFixed(0)}%
          </span>
        ) : ch != null ? (
          <span className="adsd-delta">same</span>
        ) : null}
        {hint && <span className="muted small">{hint}</span>}
      </span>
    </div>
  )
}

// ---------- insights ----------
type Insight = { tone: 'good' | 'bad' | 'info'; text: string }
function makeInsights(now: ReturnType<typeof totals>, before: ReturnType<typeof totals> | null, camps: Row[], sets: Row[], ads: Row[], setWord: string): Insight[] {
  const out: Insight[] = []
  const avgCpl = now.leads ? now.spend / now.leads : 0
  // cheapest leads
  const best = ads.filter((a) => a.leads >= 3).sort((a, b) => cpl(a) - cpl(b))[0]
  if (best && avgCpl && cpl(best) < avgCpl * 0.85)
    out.push({ tone: 'good', text: `“${best.name}” brings the cheapest leads: ${inr0(cpl(best))} per lead (${best.leads} leads), ${pct(avgCpl - cpl(best), avgCpl).toFixed(0)}% below the average.` })
  // money with no leads
  const waste = ads.filter((a) => a.leads === 0 && a.spend >= Math.max(500, avgCpl * 2)).sort((a, b) => b.spend - a.spend)
  if (waste.length)
    out.push({
      tone: 'bad',
      text:
        waste.length === 1
          ? `“${waste[0].name}” spent ${inr0(waste[0].spend)} with no leads.`
          : `${waste.length} ads spent ${inr0(waste.reduce((t, a) => t + a.spend, 0))} with no leads — biggest: “${waste[0].name}” (${inr0(waste[0].spend)}).`,
    })
  // costly ads
  const costly = ads.filter((a) => a.leads >= 2 && avgCpl && cpl(a) > avgCpl * 1.6).sort((a, b) => b.spend - a.spend)[0]
  if (costly) out.push({ tone: 'bad', text: `“${costly.name}” costs ${inr0(cpl(costly))} per lead — ${(cpl(costly) / avgCpl).toFixed(1)}× the average.` })
  // quality by ad set
  const niAvg = pct(now.ni, now.leads)
  const badSet = sets.filter((s) => s.leads >= 5 && pct(s.ni, s.leads) >= Math.max(niAvg * 1.5, 20)).sort((a, b) => pct(b.ni, b.leads) - pct(a.ni, a.leads))[0]
  if (badSet) out.push({ tone: 'bad', text: `${setWord} “${badSet.name}”: ${pct(badSet.ni, badSet.leads).toFixed(0)}% not interested (funnel average ${niAvg.toFixed(0)}%).` })
  const warmAvg = pct(now.warm, now.leads)
  const goodCamp = camps.filter((c) => c.leads >= 5 && pct(c.warm, c.leads) > warmAvg * 1.2).sort((a, b) => pct(b.warm, b.leads) - pct(a.warm, a.leads))[0]
  if (goodCamp) out.push({ tone: 'good', text: `Campaign “${goodCamp.name}” has the warmest leads: ${pct(goodCamp.warm, goodCamp.leads).toFixed(0)}% warm (average ${warmAvg.toFixed(0)}%).` })
  // where the money goes
  const topCamp = [...camps].sort((a, b) => b.spend - a.spend)[0]
  if (topCamp && camps.length > 1 && pct(topCamp.spend, now.spend) >= 50)
    out.push({ tone: 'info', text: `${pct(topCamp.spend, now.spend).toFixed(0)}% of the spend is on “${topCamp.name}” (${topCamp.leads} leads, ${pct(topCamp.leads, now.leads).toFixed(0)}% of all).` })
  // trend
  if (before && before.leads >= 3 && before.spend > 0) {
    const l = pct(now.leads - before.leads, before.leads)
    const s = pct(now.spend - before.spend, before.spend)
    const c0 = before.spend / before.leads
    const c1 = now.leads ? now.spend / now.leads : 0
    if (c1 && Math.abs(pct(c1 - c0, c0)) >= 10)
      out.push({
        tone: c1 < c0 ? 'good' : 'bad',
        text: `Cost per lead ${c1 < c0 ? 'down' : 'up'} ${Math.abs(pct(c1 - c0, c0)).toFixed(0)}% (${inr0(c0)} → ${inr0(c1)}): leads ${l >= 0 ? '+' : ''}${l.toFixed(0)}%, spend ${s >= 0 ? '+' : ''}${s.toFixed(0)}%.`,
      })
  }
  if (now.closed > 0) out.push({ tone: 'good', text: `${now.closed} closed from these ads — ${inr0(now.spend / now.closed)} of ad spend per closed lead.` })
  else if (now.leads >= 20) out.push({ tone: 'info', text: `No closed leads yet from ${now.leads} leads in these dates.` })
  return out.slice(0, 7)
}

// ---------- lead quality funnel ----------
function QualityFunnel({ t }: { t: Counts }) {
  const steps = [
    { label: 'Leads', n: t.leads, color: Q.leads },
    { label: 'Warm', n: t.warm, color: Q.warm },
    { label: 'Closed', n: t.closed, color: Q.closed },
  ]
  const max = Math.max(1, t.leads)
  return (
    <div className="stack" style={{ gap: 8 }}>
      {steps.map((s) => (
        <div key={s.label} className="adsd-fun-row">
          <span className="adsd-fun-label">{s.label}</span>
          <div className="adsd-fun-track">
            <div className="adsd-fun-bar" style={{ width: `${Math.max(s.n ? 4 : 0, (s.n / max) * 100)}%`, background: s.color }} />
          </div>
          <span className="num nowrap">
            <b>{s.n}</b> <span className="muted small">{s.label === 'Leads' ? '' : `${pct(s.n, t.leads).toFixed(0)}%`}</span>
          </span>
        </div>
      ))}
      <div className="adsd-fun-row">
        <span className="adsd-fun-label">Not interested</span>
        <div className="adsd-fun-track">
          <div className="adsd-fun-bar" style={{ width: `${Math.max(t.ni ? 4 : 0, (t.ni / max) * 100)}%`, background: Q.ni }} />
        </div>
        <span className="num nowrap">
          <b>{t.ni}</b> <span className="muted small">{pct(t.ni, t.leads).toFixed(0)}%</span>
        </span>
      </div>
      <QualityStack r={t} big />
    </div>
  )
}

/** one bar split: warm · closed · not interested · other */
function QualityStack({ r, big }: { r: Counts; big?: boolean }) {
  const other = Math.max(0, r.leads - r.warm - r.ni - r.closed)
  const parts = [
    { n: r.warm, c: Q.warm, l: 'Warm' },
    { n: r.closed, c: Q.closed, l: 'Closed' },
    { n: r.ni, c: Q.ni, l: 'Not interested' },
    { n: other, c: Q.other, l: 'Other' },
  ]
  if (!r.leads) return <div className={`adsd-qstack${big ? ' is-big' : ''}`} />
  return (
    <div className={`adsd-qstack${big ? ' is-big' : ''}`} title={parts.map((p) => `${p.l} ${p.n}`).join(' · ')}>
      {parts.map((p) => (p.n ? <span key={p.l} style={{ flex: p.n, background: p.c }} /> : null))}
    </div>
  )
}
function QualityLegend() {
  return (
    <div className="adsd-legend">
      {[
        ['Warm', Q.warm],
        ['Closed', Q.closed],
        ['Not interested', Q.ni],
        ['Other', Q.other],
      ].map(([l, c]) => (
        <span key={l}>
          <i style={{ background: c }} />
          {l}
        </span>
      ))}
    </div>
  )
}

// ---------- Date: spend bars + leads line ----------
function DateCard({ facts, counts, platform, openAd }: { facts: Fact[]; counts: LeadCount[]; platform: string; openAd: (a: Ad) => void }) {
  const [period, setPeriod] = useState<Period>(() => stored('spend:period', 'day'))
  const rows = useMemo(() => buildRows('date', period, facts, counts).sort((a, b) => a.key.localeCompare(b.key)), [facts, counts, period])
  return (
    <PerfCard
      title="Date Performance"
      platform={platform}
      rows={rows}
      by="date"
      openAd={openAd}
      tools={
        <div className="seg seg-sm" role="group" aria-label="Period">
          {(['day', 'week', 'month'] as Period[]).map((p) => (
            <button key={p} type="button" className={period === p ? 'is-active' : undefined} onClick={() => (setPeriod(p), store('spend:period', p))}>
              {p === 'day' ? 'Day' : p === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
      }
    >
      <Combo rows={rows} period={period} />
    </PerfCard>
  )
}

function Combo({ rows, period }: { rows: Row[]; period: Period }) {
  const [ref, W] = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  const H = 280
  const P = { l: 52, r: 40, t: 16, b: 30 }
  const n = rows.length
  const maxS = Math.max(1, ...rows.map((r) => r.spend))
  const maxL = Math.max(4, ...rows.map((r) => r.leads))
  const niceS = (() => {
    const p = 10 ** Math.floor(Math.log10(maxS))
    const m = maxS / p
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p
  })()
  const niceL = Math.ceil(maxL / 4) * 4
  const bw = (W - P.l - P.r) / Math.max(1, n)
  const x = (i: number) => P.l + bw * i + bw / 2
  const yS = (v: number) => P.t + (H - P.t - P.b) * (1 - v / niceS)
  const yL = (v: number) => P.t + (H - P.t - P.b) * (1 - v / niceL)
  const every = Math.max(1, Math.ceil(n / Math.max(4, Math.floor(W / 80))))
  const line = rows.map((r, i) => `${i ? 'L' : 'M'}${x(i)},${yL(r.leads)}`).join(' ')
  const h = hover != null ? rows[hover] : null
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="adsd-legend">
        <span>
          <i style={{ background: Q.spend }} />
          Spend
        </span>
        <span>
          <i className="is-line" style={{ background: Q.leads }} />
          Leads
        </span>
        <span>
          <i className="is-line" style={{ background: Q.warm }} />
          Warm
        </span>
      </div>
      <div ref={ref} style={{ position: 'relative' }}>
        <svg width={W} height={H} style={{ display: 'block' }} onMouseLeave={() => setHover(null)}>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={P.l} x2={W - P.r} y1={yS(f * niceS)} y2={yS(f * niceS)} stroke="var(--line)" />
              <text x={P.l - 8} y={yS(f * niceS) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)">
                {kshort(f * niceS)}
              </text>
              <text x={W - P.r + 8} y={yL(f * niceL) + 4} fontSize={11} fill={Q.leads}>
                {Math.round(f * niceL)}
              </text>
            </g>
          ))}
          {rows.map((r, i) => (
            <rect
              key={r.key}
              x={x(i) - Math.min(28, bw * 0.62) / 2}
              y={yS(r.spend)}
              width={Math.min(28, bw * 0.62)}
              height={Math.max(0, H - P.b - yS(r.spend))}
              rx={4}
              fill={Q.spend}
              opacity={hover == null || hover === i ? 0.85 : 0.35}
            />
          ))}
          <path d={rows.map((r, i) => `${i ? 'L' : 'M'}${x(i)},${yL(r.warm)}`).join(' ')} fill="none" stroke={Q.warm} strokeWidth={2} strokeDasharray="5 4" />
          <path d={line} fill="none" stroke={Q.leads} strokeWidth={2.5} />
          {rows.map((r, i) => (
            <circle key={r.key} cx={x(i)} cy={yL(r.leads)} r={hover === i ? 5 : 3} fill="#fff" stroke={Q.leads} strokeWidth={2} />
          ))}
          {rows.map((r, i) =>
            i % every === 0 || i === n - 1 ? (
              <text key={r.key} x={x(i)} y={H - 9} textAnchor="middle" fontSize={11} fill="var(--text-muted)">
                {axisLabel(r.key, period)}
              </text>
            ) : null,
          )}
          {rows.map((r, i) => (
            <rect key={`h${r.key}`} x={P.l + bw * i} y={P.t} width={bw} height={H - P.t - P.b} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
        {h && (
          <div className="adsd-tip" style={{ left: Math.min(W - 200, Math.max(0, x(hover!) - 100)), top: 4 }}>
            <b>{h.name}</b>
            <span>Spend {inr0(h.spend)}</span>
            <span>
              Leads {h.leads} · {h.leads ? `${inr0(h.spend / h.leads)}/lead` : '—'}
            </span>
            <span>
              Warm {h.warm} · Closed {h.closed} · Not int. {h.ni}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- Campaign: donut + quality bars ----------
function Donut({ rows }: { rows: Row[] }) {
  const list = [...rows].sort((a, b) => b.spend - a.spend)
  const top = list.slice(0, 7)
  const rest = list.slice(7)
  const slices = [...top.map((r) => ({ name: r.name, v: r.spend })), ...(rest.length ? [{ name: `Other ${rest.length}`, v: rest.reduce((t, r) => t + r.spend, 0) }] : [])]
  const sum = slices.reduce((t, s) => t + s.v, 0) || 1
  const R = 64
  const C = 2 * Math.PI * R
  let off = 0
  const [hover, setHover] = useState<number | null>(null)
  return (
    <div className="adsd-donut">
      <svg width={170} height={170} viewBox="0 0 170 170">
        <circle cx={85} cy={85} r={R} fill="none" stroke="var(--surface-muted)" strokeWidth={24} />
        {slices.map((s, i) => {
          const len = (s.v / sum) * C
          const el = (
            <circle
              key={s.name}
              cx={85}
              cy={85}
              r={R}
              fill="none"
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth={hover === i ? 30 : 24}
              strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`}
              strokeDashoffset={-off}
              transform="rotate(-90 85 85)"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ transition: 'stroke-width .15s' }}
            />
          )
          off += len
          return el
        })}
        <text x={85} y={80} textAnchor="middle" fontSize={11} fill="var(--text-muted)">
          {hover != null ? `${pct(slices[hover].v, sum).toFixed(0)}% of spend` : 'Spend'}
        </text>
        <text x={85} y={100} textAnchor="middle" fontSize={17} fontWeight={700} fill="var(--text)">
          {kshort(hover != null ? slices[hover].v : sum)}
        </text>
      </svg>
      <div className="adsd-donut-legend">
        {slices.map((s, i) => (
          <div key={s.name} className={hover === i ? 'is-on' : undefined} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <i style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="adsd-ellipsis">{s.name}</span>
            <b>{pct(s.v, sum).toFixed(0)}%</b>
          </div>
        ))}
      </div>
    </div>
  )
}

function QualityBars({ rows }: { rows: Row[] }) {
  const list = [...rows].sort((a, b) => b.leads - a.leads || b.spend - a.spend).slice(0, 8)
  const max = Math.max(1, ...list.map((r) => r.leads))
  return (
    <div className="stack" style={{ gap: 10, minWidth: 0 }}>
      <div className="row-between" style={{ gap: 8, flexWrap: 'wrap' }}>
        <span className="muted small">Leads and their quality</span>
        <QualityLegend />
      </div>
      {list.map((r) => (
        <div key={r.key} className="adsd-qrow">
          <div className="adsd-qrow-top">
            <span className="adsd-ellipsis" title={r.name}>
              {r.name}
            </span>
            <span className="muted small nowrap">
              <b style={{ color: 'var(--text)' }}>{r.leads}</b> leads · {r.leads ? `${inr0(cpl(r))}/lead` : 'no leads'}
            </span>
          </div>
          <div style={{ width: `${Math.max(r.leads ? 3 : 0, (r.leads / max) * 100)}%` }}>
            <QualityStack r={r} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------- Ad set: share of spend vs share of leads ----------
/** each ad set: its share of the spend against its share of the leads (more leads than spend = it pulls its weight) */
function ShareBars({ rows }: { rows: Row[] }) {
  const [all, setAll] = useState(false)
  const sumS = rows.reduce((t, r) => t + r.spend, 0) || 1
  const sumL = rows.reduce((t, r) => t + r.leads, 0)
  const avg = sumL ? sumS / sumL : 0
  const list = [...rows].sort((a, b) => b.spend - a.spend)
  const shown = all ? list : list.slice(0, 8)
  const max = Math.max(1, ...list.map((r) => Math.max(pct(r.spend, sumS), pct(r.leads, sumL))))
  const verdict = (r: Row) => (!r.leads ? { t: 'No leads', c: 'is-bad' } : cpl(r) <= avg * 0.9 ? { t: 'Efficient', c: 'is-good' } : cpl(r) >= avg * 1.4 ? { t: 'Costly', c: 'is-bad' } : { t: 'Average', c: 'is-warn' })
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row-between" style={{ gap: 8, flexWrap: 'wrap' }}>
        <span className="muted small">Share of spend vs share of leads · average {avg ? inr0(avg) : '—'} per lead</span>
        <div className="adsd-legend">
          <span>
            <i style={{ background: Q.spend }} />% of spend
          </span>
          <span>
            <i style={{ background: Q.leads }} />% of leads
          </span>
        </div>
      </div>
      <div className="adsd-share">
        {shown.map((r) => {
          const v = verdict(r)
          return (
            <div key={r.key} className="adsd-share-row" title={`${r.name} — ${r.sub}`}>
              <div className="adsd-share-name">
                <span className="row" style={{ gap: 6, flexWrap: 'nowrap', minWidth: 0 }}>
                  <b className="adsd-ellipsis">{r.name}</b>
                  <span className={`adsd-tag ${v.c}`}>{v.t}</span>
                </span>
                <span className="muted small adsd-ellipsis">{r.sub}</span>
              </div>
              <div className="adsd-share-bars">
                <div className="adsd-share-line">
                  <span className="adsd-share-bar" style={{ width: `${(pct(r.spend, sumS) / max) * 100}%`, background: Q.spend }} />
                  <span className="small nowrap">
                    {pct(r.spend, sumS).toFixed(0)}% · {inr0(r.spend)}
                  </span>
                </div>
                <div className="adsd-share-line">
                  <span className="adsd-share-bar" style={{ width: `${(pct(r.leads, sumL) / max) * 100}%`, background: Q.leads }} />
                  <span className="small nowrap">
                    {pct(r.leads, sumL).toFixed(0)}% · {r.leads} lead{r.leads === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
              <div className="adsd-board-num">
                <b>{r.leads ? inr0(cpl(r)) : '—'}</b>
                <span className="muted small">per lead</span>
              </div>
            </div>
          )
        })}
      </div>
      {list.length > 8 && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAll((a) => !a)}>
          {all ? 'Show top 8' : `Show all ${list.length}`}
        </button>
      )}
    </div>
  )
}

// ---------- Ads: leaderboard ----------
function Leaderboard({ rows, openAd }: { rows: Row[]; openAd: (a: Ad) => void }) {
  const [all, setAll] = useState(false)
  const list = [...rows].sort((a, b) => b.leads - a.leads || a.spend - b.spend)
  const withLeads = rows.filter((r) => r.leads >= 3)
  const best = new Set([...withLeads].sort((a, b) => cpl(a) - cpl(b)).slice(0, 3).map((r) => r.key))
  const sumS = rows.reduce((t, r) => t + r.spend, 0)
  const sumL = rows.reduce((t, r) => t + r.leads, 0)
  const avg = sumL ? sumS / sumL : 0
  const shown = all ? list : list.slice(0, 10)
  const maxL = Math.max(1, ...list.map((r) => r.leads))
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row-between" style={{ gap: 8, flexWrap: 'wrap' }}>
        <span className="muted small">By leads · average {avg ? inr0(avg) : '—'} per lead</span>
        <QualityLegend />
      </div>
      <div className="adsd-board">
        {shown.map((r, i) => {
          const waste = !r.leads && r.spend >= Math.max(500, avg * 2)
          const costly = r.leads >= 2 && avg && cpl(r) > avg * 1.6
          return (
            <button key={r.key} type="button" className="adsd-board-row" onClick={() => r.ad && openAd(r.ad)} title="See the ad">
              <span className={`adsd-rank${i < 3 ? ` is-top is-${i + 1}` : ''}`}>{i + 1}</span>
              <span className="adsd-board-main">
                <span className="adsd-board-title">
                  <b className="adsd-ellipsis" title={r.name}>
                    {r.name}
                  </b>
                  {best.has(r.key) && <span className="adsd-tag is-good">Cheapest leads</span>}
                  {waste && <span className="adsd-tag is-bad">Spending, no leads</span>}
                  {costly && <span className="adsd-tag is-warn">Costly</span>}
                </span>
                <span className="muted small adsd-ellipsis">{r.sub}</span>
                <span style={{ width: `${Math.max(r.leads ? 3 : 0, (r.leads / maxL) * 100)}%`, display: 'block' }}>
                  <QualityStack r={r} />
                </span>
              </span>
              <span className="adsd-board-num">
                <b>{r.leads}</b>
                <span className="muted small">leads</span>
              </span>
              <span className="adsd-board-num">
                <b>{r.leads ? inr0(cpl(r)) : '—'}</b>
                <span className="muted small">per lead</span>
              </span>
              <span className="adsd-board-num">
                <b>{inr0(r.spend)}</b>
                <span className="muted small">spend</span>
              </span>
            </button>
          )
        })}
      </div>
      {list.length > 10 && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAll((a) => !a)}>
          {all ? 'Show top 10' : `Show all ${list.length} ads`}
        </button>
      )}
    </div>
  )
}

// ---------- a report card: chart, or its table ----------
function PerfCard({ title, platform, rows, by, openAd, tools, children }: { title: string; platform: string; rows: Row[]; by: By; openAd: (a: Ad) => void; tools?: ReactNode; children: ReactNode }) {
  const [table, setTable] = useState(false)
  return (
    <section className="card card-pad stack" style={{ gap: 14 }}>
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="row" style={{ gap: 8 }}>
          <b>{title}</b>
          <span className="badge badge-muted">{platform}</span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {tools}
          <button type="button" className={`btn btn-sm ${table ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTable((t) => !t)} title={table ? 'Back to the chart' : 'See the table'}>
            {table ? <ChartNoAxesColumn size={14} /> : <Table2 size={14} />} {table ? 'Chart' : 'Table'}
          </button>
        </div>
      </div>
      {!rows.length ? <div className="muted small">No spend or leads in these dates.</div> : table ? <PerfTable rows={rows} by={by} openAd={openAd} /> : children}
    </section>
  )
}

function PerfTable({ rows, by, openAd }: { rows: Row[]; by: By; openAd: (a: Ad) => void }) {
  const [sort, setSort] = useState<{ k: SortKey; desc: boolean } | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const list = useMemo(() => {
    const s = sort ?? (by === 'date' ? { k: 'name' as SortKey, desc: true } : { k: 'spend' as SortKey, desc: true })
    const val = (r: Row): number | string => (s.k === 'name' ? (by === 'date' ? r.key : r.name.toLowerCase()) : s.k === 'cpl' ? (r.leads ? r.spend / r.leads : 1e12) : r[s.k])
    return [...rows].sort((a, b) => {
      const x = val(a)
      const y = val(b)
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
      return s.desc ? -c : c
    })
  }, [rows, sort, by])
  const rank = new Map([...rows].sort((a, b) => b.spend - a.spend).map((r, i) => [r.key, i + 1]))
  const tot = rows.reduce((t, r) => ({ spend: t.spend + r.spend, gst: t.gst + r.gst, leads: t.leads + r.leads, warm: t.warm + r.warm, ni: t.ni + r.ni, closed: t.closed + r.closed }), { spend: 0, gst: 0, leads: 0, warm: 0, ni: 0, closed: 0 })
  const money = (ex: number, inc: number) => (
    <span className="gst-hover" title={`${inr(ex)} + GST ${inr(inc - ex)} = ${inr(inc)} with GST`}>
      {inr(ex)}
    </span>
  )
  const head = (k: SortKey, label: string, num = true) => {
    const on = sort?.k === k
    return (
      <th className={num ? 'num' : undefined} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => setSort({ k, desc: on ? !sort!.desc : k !== 'name' && k !== 'cpl' })}>
        {label} {on && (sort!.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
      </th>
    )
  }
  return (
    <div className="table-wrap">
      <table className="table table-compact">
        <thead>
          <tr>
            {by !== 'date' && <th style={{ width: 56 }}>Rank</th>}
            {head('name', by === 'date' ? 'Date' : 'Name', false)}
            {head('spend', 'Spend')}
            {head('leads', 'Leads')}
            {head('cpl', 'Cost / lead')}
            {head('warm', 'Warm')}
            {head('ni', 'Not Interested')}
            {head('closed', 'Closed')}
          </tr>
        </thead>
        <tbody>
          {list.map((r) => {
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
                  <td className="num nowrap">{r.leads ? inr0(r.spend / r.leads) : '—'}</td>
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
                      <td colSpan={5} />
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
            <td className="num nowrap">
              <b>{tot.leads ? inr0(tot.spend / tot.leads) : '—'}</b>
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
  )
}
