import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Modal } from '@/components/Modal'
import { Filter, List, TrendingDown, TrendingUp } from 'lucide-react'
import { funnelAdsReport, funnelFlow, type AdsReport, type FunnelFlow as Flow } from '@/meta/api'
import { funnelGoogleDays } from '@/google/api'
import { FunnelFlow } from './FunnelFlow'
import { MetaSync } from './MetaSync'
import { DateRangePicker, type Range } from '@/components/DateRange'
import { useTenant } from '@/tenant/useTenant'
import { db } from '@/lib/supabase'

const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const iso = (d: Date) => d.toLocaleDateString('en-CA')
const at = (s: string) => new Date(`${s}T00:00:00`)
const short = (s: string) => at(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
/** a lead's day: its creation date in India time */
/** '14:30' → '2:30 pm' */
const clockOf = (t: string) => (t ? new Date(2000, 0, 1, Number(t.slice(0, 2)), Number(t.slice(3, 5))).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '')
export const leadDay = (ts: string) => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

type By = 'day' | 'week' | 'month'
type Row = {
  key: string
  label: string
  sub?: string
  spend: number
  gst: number
  leads: number
  booked: number
  showed: number
  paid: number
  closed: number
  invoiced: number
  received: number
  ls: Lead[]
}
type Lead = { id: string; created_at: string; utm_source?: string | null; is_archived?: boolean; phone?: string | null; email?: string | null; temperature?: string | null; first_name?: string | null; last_name?: string | null }
/** where a lead came from, by its UTM source: Facebook / Instagram (fb, ig…) or Google (google, adwords, youtube…) */
const FB_UTM = new Set(['fb', 'ig', 'facebook', 'instagram', 'meta', 'an', 'msg', 'messenger', 'threads', 'th'])
const GOOGLE_UTM = new Set(['google', 'adwords', 'gads', 'googleads', 'google_ads', 'youtube', 'yt', 'gdn'])
export type Src = 'all' | 'fb' | 'google'
export const fromSrc = (l: Pick<Lead, 'utm_source'>, s: Src) => s === 'all' || (s === 'fb' ? FB_UTM : GOOGLE_UTM).has(String(l.utm_source ?? '').trim().toLowerCase())
const who = (l: Lead) => [l.first_name, l.last_name].filter(Boolean).join(' ') || l.phone || 'Lead'
const last10 = (p: string | null | undefined) => {
  const d = (p ?? '').replace(/\D/g, '')
  return d.length >= 10 ? d.slice(-10) : ''
}
const mail = (e: string | null | undefined) => (e ?? '').trim().toLowerCase()
/** a % with its hover: a ÷ b */
const pct = (a: number, b: number, what: string) => <span title={`${what}: ${a} ÷ ${b}`}>{b ? `${((a / b) * 100).toFixed(1)}%` : '—'}</span>

/**
 * Funnel → Overview: the 3D funnel (Facebook reach → clicks → page views → leads → stages → revenue) and its numbers, for a
 * period; or the List: spend (with GST), leads (by their creation date) and CPL per day / week / month.
 */
export function FunnelAdsReport({
  funnelId,
  leads,
  range,
  setRange,
  src,
  setSrc,
}: {
  funnelId: string
  leads?: Lead[] | null
  /** the period and the source: kept by the funnel page, so the Overview tiles follow them too */
  range: Range
  setRange: (r: Range) => void
  src: Src
  setSrc: (s: Src) => void
}) {
  const tenant = useTenant()
  const { from, to } = range
  const [reload, setReload] = useState(0)
  const [view, setView] = useState<'funnel' | 'list'>('funnel')
  const [by, setBy] = useState<By>('day')
  const [gDays, setGDays] = useState<{ day: string; spend: number; spend_gst: number }[]>([])
  useEffect(() => {
    funnelGoogleDays(tenant.id, funnelId, from, to).then(
      (g) => setGDays(g.days),
      () => setGDays([]),
    )
  }, [tenant.id, funnelId, from, to, reload])
  const [flow, setFlow] = useState<Flow | null | undefined>(undefined)
  const [report, setReport] = useState<AdsReport | null>(null)
  // with GST ÷ without, from Facebook's days (each ad account has its own GST %)
  const [gst, setGst] = useState(1.18)
  const navigate = useNavigate()
  const [show, setShow] = useState<{ r: Row; k: 'leads' | 'paid' | 'booked' | 'showed' | 'closed' | 'revenue' } | null>(null)
  const [error, setError] = useState<string | null>(null)
  // the funnel's leads with a meeting (Booking) and with a meeting done (Showup)
  const [meet, setMeet] = useState<{ booked: Map<string, string>; showed: Map<string, string> }>({ booked: new Map(), showed: new Map() })
  const ids = useMemo(() => (leads ?? []).map((l) => l.id), [leads])
  useEffect(() => {
    if (!ids.length) return
    let live = true
    void (async () => {
      // per lead: its first meeting (Booking) and its last meeting done (Show up), as 'YYYY-MM-DD HH:MM'
      const booked = new Map<string, string>()
      const showed = new Map<string, string>()
      for (let i = 0; i < ids.length; i += 300) {
        const { data } = await db()
          .from('meetings')
          .select('lead_id, status, meeting_date, start_time')
          .eq('tenant_id', tenant.id)
          .in('lead_id', ids.slice(i, i + 300))
        for (const m of (data ?? []) as { lead_id: string; status: string; meeting_date: string; start_time: string }[]) {
          if (m.status === 'cancelled') continue
          const at = `${m.meeting_date} ${String(m.start_time).slice(0, 5)}`
          if (!booked.has(m.lead_id) || at < booked.get(m.lead_id)!) booked.set(m.lead_id, at)
          if (m.status === 'done' && (!showed.has(m.lead_id) || at > showed.get(m.lead_id)!)) showed.set(m.lead_id, at)
        }
      }
      if (live) setMeet({ booked, showed })
    })()
    return () => {
      live = false
    }
  }, [ids, tenant.id, reload])

  // per lead: Razorpay payments (the funnel's products, else all) by phone / email, and invoice totals (bookings)
  const [money2, setMoney2] = useState<{ pays: Map<string, { n: number; amt: number; last: string }>; billed: Map<string, number> }>({ pays: new Map(), billed: new Map() })
  useEffect(() => {
    if (!ids.length) return
    let live = true
    void (async () => {
      const billed = new Map<string, number>()
      for (let i = 0; i < ids.length; i += 300) {
        const { data } = await db()
          .from('bookings')
          .select('lead_id, total_amount')
          .eq('tenant_id', tenant.id)
          .neq('status', 'cancelled')
          .in('lead_id', ids.slice(i, i + 300))
        for (const b of (data ?? []) as { lead_id: string; total_amount: number }[]) billed.set(b.lead_id, (billed.get(b.lead_id) ?? 0) + Number(b.total_amount || 0))
      }
      const { data: f } = await db().from('funnels').select('payment_descriptions').eq('id', funnelId).maybeSingle()
      const products = ((f?.payment_descriptions ?? []) as string[]).filter(Boolean)
      let q = db().from('razorpay_payments').select('phone, email, amount, amount_refunded, description, paid_at').eq('tenant_id', tenant.id).in('status', ['captured', 'refunded'])
      if (products.length) q = q.in('description', products)
      const { data: rz } = await q.limit(20000)
      const byPhone = new Map<string, string>()
      const byEmail = new Map<string, string>()
      for (const l of leads ?? []) {
        const p = last10(l.phone)
        if (p && !byPhone.has(p)) byPhone.set(p, l.id)
        const m = mail(l.email)
        if (m && !byEmail.has(m)) byEmail.set(m, l.id)
      }
      const pays = new Map<string, { n: number; amt: number; last: string }>()
      for (const x of (rz ?? []) as { phone: string | null; email: string | null; amount: number; amount_refunded: number; paid_at: string }[]) {
        const id = byPhone.get(last10(x.phone)) ?? byEmail.get(mail(x.email))
        if (!id) continue
        const c = pays.get(id) ?? { n: 0, amt: 0, last: '' }
        c.n++
        if (x.paid_at > c.last) c.last = x.paid_at
        c.amt += Number(x.amount || 0) - Number(x.amount_refunded || 0)
        pays.set(id, c)
      }
      if (live) setMoney2({ pays, billed })
    })()
    return () => {
      live = false
    }
  }, [ids, leads, funnelId, tenant.id, reload])

  useEffect(() => {
    setFlow(undefined)
    setReport(null)
    setError(null)
    funnelFlow(funnelId, from, to, src).then(setFlow, (e: Error) => setError(e.message))
    funnelAdsReport(funnelId, from, to).then(
      (r) => {
        setReport(r)
        const days = (r?.days ?? []).filter((d) => d.meta)
        const ex = days.reduce((t, d) => t + Number(d.spend), 0)
        const inc = days.reduce((t, d) => t + Number(d.spend_gst), 0)
        setGst(ex ? inc / ex : 1.18)
      },
      () => setGst(1.18),
    )
  }, [funnelId, from, to, reload, src])

  // every day / week (Mon–Sun) / month in the dates picked, with its spend and the leads created in it
  const rows = useMemo(() => {
    if (!from || !to) return [] as Row[]
    const spend = new Map<string, { s: number; g: number }>()
    const addSpend = (day: string, s: number, g: number) => {
      const x = spend.get(day) ?? { s: 0, g: 0 }
      x.s += s
      x.g += g
      spend.set(day, x)
    }
    if (src !== 'google') for (const d of report?.days ?? []) addSpend(d.day, Number(d.spend) || 0, Number(d.spend_gst) || 0)
    if (src !== 'fb') for (const d of gDays) addSpend(d.day, d.spend, d.spend_gst)
    const made = new Map<string, { n: number; b: number; s: number; p: number; c: number; inv: number; rec: number; ls: Lead[] }>()
    for (const l of leads ?? []) {
      if (l.is_archived || !fromSrc(l, src)) continue
      const d = leadDay(l.created_at)
      if (d < from || d > to) continue
      const c = made.get(d) ?? { n: 0, b: 0, s: 0, p: 0, c: 0, inv: 0, rec: 0, ls: [] as Lead[] }
      c.n++
      c.ls.push(l)
      c.p += money2.pays.get(l.id)?.n ?? 0
      c.rec += money2.pays.get(l.id)?.amt ?? 0
      c.inv += money2.billed.get(l.id) ?? 0
      if (l.temperature === 'closed') c.c++
      if (meet.booked.has(l.id)) c.b++
      if (meet.showed.has(l.id)) c.s++
      made.set(d, c)
    }
    const out = new Map<string, Row>()
    for (let d = at(from); iso(d) <= to; d.setDate(d.getDate() + 1)) {
      const day = iso(d)
      let key = day
      let label = at(day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      let sub: string | undefined = at(day).toLocaleDateString('en-IN', { weekday: 'long' })
      if (by === 'week') {
        const mon = new Date(d)
        mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7))
        const sun = new Date(mon)
        sun.setDate(sun.getDate() + 6)
        const a = iso(mon) < from ? from : iso(mon)
        const b = iso(sun) > to ? to : iso(sun)
        key = iso(mon)
        label = `${short(a)} – ${short(b)}`
        sub = a.slice(0, 4) === b.slice(0, 4) ? a.slice(0, 4) : undefined
      } else if (by === 'month') {
        key = day.slice(0, 7)
        label = at(day).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
        sub = undefined
      }
      const r = out.get(key) ?? { key, label, sub, spend: 0, gst: 0, leads: 0, booked: 0, showed: 0, paid: 0, closed: 0, invoiced: 0, received: 0, ls: [] }
      r.spend += spend.get(day)?.s ?? 0
      r.gst += spend.get(day)?.g ?? 0
      r.leads += made.get(day)?.n ?? 0
      r.booked += made.get(day)?.b ?? 0
      r.showed += made.get(day)?.s ?? 0
      r.paid += made.get(day)?.p ?? 0
      r.closed += made.get(day)?.c ?? 0
      r.invoiced += made.get(day)?.inv ?? 0
      r.received += made.get(day)?.rec ?? 0
      r.ls = r.ls.concat(made.get(day)?.ls ?? [])
      out.set(key, r)
    }
    // newest first
    return [...out.values()].reverse()
  }, [report, gDays, src, leads, meet, money2, from, to, by])
  const total = rows.reduce(
    (t, r) => ({
      ...t,
      spend: t.spend + r.spend,
      gst: t.gst + r.gst,
      leads: t.leads + r.leads,
      booked: t.booked + r.booked,
      showed: t.showed + r.showed,
      paid: t.paid + r.paid,
      closed: t.closed + r.closed,
      invoiced: t.invoiced + r.invoiced,
      received: t.received + r.received,
      ls: t.ls.concat(r.ls),
    }),
    { key: 'total', label: 'Total', spend: 0, gst: 0, leads: 0, booked: 0, showed: 0, paid: 0, closed: 0, invoiced: 0, received: 0, ls: [] } as Row,
  )
  // leads vs the row before it in time (the next row down, newest first)
  const trend = (i: number) => {
    const prev = rows[i + 1]
    if (!prev) return <span className="muted">—</span>
    const a = rows[i].leads
    const b = prev.leads
    if (a === b) return <span className="muted">0%</span>
    if (!b)
      return (
        <span className="trend-up" title={`${b} → ${a} leads`}>
          <TrendingUp size={14} /> new
        </span>
      )
    const up = a > b
    return (
      <span className={up ? 'trend-up' : 'trend-down'} title={`${b} → ${a} leads`}>
        {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />} {Math.abs(((a - b) / b) * 100).toFixed(0)}%
      </span>
    )
  }
  // hover: the leads behind a count / amount (with their amount where there is one)
  const MAX = 40
  const list = (lines: string[]) => (lines.length > MAX ? [...lines.slice(0, MAX), `… and ${lines.length - MAX} more`] : lines).join('\n')
  const rev = (l: Lead) => (money2.billed.get(l.id) ?? 0) + (money2.pays.get(l.id)?.amt ?? 0)
  type K = 'leads' | 'paid' | 'booked' | 'showed' | 'closed' | 'revenue'
  const pickOf = (k: K) =>
    ({
      leads: () => true,
      paid: (l: Lead) => !!money2.pays.get(l.id)?.n,
      booked: (l: Lead) => meet.booked.has(l.id),
      showed: (l: Lead) => meet.showed.has(l.id),
      closed: (l: Lead) => l.temperature === 'closed',
      revenue: (l: Lead) => rev(l) > 0,
    })[k]
  const tip = (r: Row, k: K) => {
    const pick = {
      leads: () => true,
      paid: (l: Lead) => !!money2.pays.get(l.id)?.n,
      booked: (l: Lead) => meet.booked.has(l.id),
      showed: (l: Lead) => meet.showed.has(l.id),
      closed: (l: Lead) => l.temperature === 'closed',
      revenue: (l: Lead) => rev(l) > 0,
    }[k]
    return list(
      r.ls.filter(pick).map((l) => {
        if (k === 'paid') {
          const p = money2.pays.get(l.id)!
          return `${who(l)} — ${p.n} payment${p.n === 1 ? '' : 's'}, ${inr(p.amt)}`
        }
        if (k === 'revenue') {
          const inv = money2.billed.get(l.id) ?? 0
          const rz = money2.pays.get(l.id)?.amt ?? 0
          return `${who(l)} — ${inr(inv + rz)}${inv && rz ? ` (${inr(inv)} invoices + ${inr(rz)} Razorpay)` : rz ? ' (Razorpay)' : ' (invoices)'}`
        }
        return rev(l) ? `${who(l)} — ${inr(rev(l))}` : who(l)
      }),
    )
  }
  // click: the same leads in a list
  const open = (r: Row, k: K) => () => setShow({ r, k })
  const n = (v: number, r: Row, k: K) =>
    v ? (
      <span title={tip(r, k)} onClick={open(r, k)}>
        {v}
      </span>
    ) : (
      <span className="muted">0</span>
    )
  const cells = (r: Row) => (
    <>
      <td className="num">{cpl(r.gst, r.spend, r.leads, open(r, 'leads'))}</td>
      <td className="num">{n(r.paid, r, 'paid')}</td>
      <td className="num">{cpl(r.gst, r.spend, r.paid, open(r, 'paid'))}</td>
      <td className="num">{n(r.booked, r, 'booked')}</td>
      <td className="num">{cpl(r.gst, r.spend, r.booked, open(r, 'booked'))}</td>
      <td className="num">{n(r.showed, r, 'showed')}</td>
      <td className="num">{cpl(r.gst, r.spend, r.showed, open(r, 'showed'))}</td>
      <td className="num">{n(r.closed, r, 'closed')}</td>
      <td className="num">
        {r.invoiced + r.received ? (
          <span title={`${inr(r.invoiced)} invoices + ${inr(r.received)} Razorpay\n\n${tip(r, 'revenue')}`} onClick={open(r, 'revenue')}>
            {inr(r.invoiced + r.received)}
          </span>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td className="num">{pct(r.paid, r.leads, 'Payments ÷ leads')}</td>
      <td className="num">{pct(r.booked, r.paid, 'Bookings ÷ payments')}</td>
      <td className="num">{pct(r.showed, r.booked, 'Show ups ÷ bookings')}</td>
    </>
  )
  const money = (gstAmt: number, ex: number) => <span title={ex ? `${inr(gstAmt)} with GST (${inr(gstAmt - ex)} GST)` : undefined}>{ex ? inr(ex) : '—'}</span>
  const cpl = (gstAmt: number, ex: number, n: number, onClick?: () => void) =>
    n && gstAmt ? (
      <span title={`${inr(ex / n)} without GST`} onClick={onClick}>
        {inr(gstAmt / n)}
      </span>
    ) : (
      <span className="muted">—</span>
    )

  return (
    <section className="card card-pad stack" style={{ gap: 14 }}>
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <b>Funnel report</b>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <MetaSync tenantId={tenant.id} onDone={() => setReload((n) => n + 1)} />
          {(
            <select className="input input-sm filter-select" value={src} onChange={(e) => setSrc(e.target.value as Src)} aria-label="Ads">
              <option value="all">Overall (Facebook + Google)</option>
              <option value="fb">Facebook</option>
              <option value="google">Google</option>
            </select>
          )}
          {view === 'list' && (
            <select className="input input-sm filter-select" value={by} onChange={(e) => setBy(e.target.value as By)} aria-label="Group by">
              <option value="day">Day wise</option>
              <option value="week">Week wise</option>
              <option value="month">Month wise</option>
            </select>
          )}
          <DateRangePicker value={range} onChange={setRange} />
          <div className="seg" role="group" aria-label="View">
            <button type="button" className={view === 'funnel' ? 'is-active' : undefined} onClick={() => setView('funnel')} title="Funnel">
              <Filter size={15} /> Funnel
            </button>
            <button type="button" className={view === 'list' ? 'is-active' : undefined} onClick={() => setView('list')} title="List">
              <List size={15} /> List
            </button>
          </div>
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {view === 'funnel' && (
        <>
          {flow === undefined && !error && <div className="muted small">Loading…</div>}
          {flow === null && <div className="muted small">You can’t see this funnel’s report.</div>}
          {flow && (
            <>
              {!flow.linked && <div className="muted small">No {src === 'fb' ? 'Facebook' : src === 'google' ? 'Google' : 'Facebook or Google'} campaigns are added to this funnel yet ({src === 'google' ? 'Google Ads' : src === 'fb' ? 'Facebook Ads' : 'Facebook Ads / Google Ads'} tab), so there’s no ad reach or spend.</div>}
              {src !== 'all' && <div className="muted small">{src === 'fb' ? 'Facebook' : 'Google'}: the leads whose UTM source is {src === 'fb' ? 'fb / ig / facebook / instagram' : 'google / adwords / youtube'}.</div>}
              <FunnelFlow f={flow} gst={gst} />
            </>
          )}
        </>
      )}
      {view === 'list' &&
        (!report && !error ? (
          <div className="muted small">Loading…</div>
        ) : (
          <>
            <div className="muted small">
              {src === 'all' ? 'Overall: Facebook + Google spend, every lead. ' : src === 'fb' ? 'Facebook: Facebook spend, the leads whose UTM source is fb / ig / facebook / instagram. ' : 'Google: Google spend, the leads whose UTM source is google / adwords / youtube. '}
              By the leads created in each row: Amount spent without GST (hover: with GST) · Lead trend = leads vs the row below · CPL / CPP / Cost per booking / Cost per show up = amount spent ÷
              leads / payments / bookings / show ups · Payments = Razorpay payments (the funnel’s products in the Payments tab, else all) by those leads’ phone or email · Booking = those leads with a
              meeting · Show up = meeting done · Converted = marked Closed · Revenue = their invoices’ total + Razorpay received.
            </div>
            {/* every row, no paging */}
            {
              <div className="table-wrap">
                <table className="table table-compact funnel-list">
                  <thead>
                    <tr>
                      <th>{by === 'day' ? 'Date' : by === 'week' ? 'Week' : 'Month'}</th>
                      <th className="num">Amount</th>
                      <th className="num">Leads</th>
                      <th className="num">Lead trend</th>
                      <th className="num">CPL</th>
                      <th className="num">Payments</th>
                      <th className="num">CPP</th>
                      <th className="num">Booking</th>
                      <th className="num">Cost per booking</th>
                      <th className="num">Show up</th>
                      <th className="num">Cost per show up</th>
                      <th className="num">Converted</th>
                      <th className="num">Revenue</th>
                      <th className="num">Lead to payment</th>
                      <th className="num">Payment to booking</th>
                      <th className="num">Booking to show up</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.key}>
                        <td className="nowrap">
                          {r.label}
                          {r.sub && <div className="muted small">{r.sub}</div>}
                        </td>
                        <td className="num">{money(r.gst, r.spend)}</td>
                        <td className="num">{n(r.leads, r, 'leads')}</td>
                        <td className="num nowrap">{trend(i)}</td>
                        {cells(r)}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>Total</th>
                      <th className="num">{money(total.gst, total.spend)}</th>
                      <th className="num">{n(total.leads, total, 'leads')}</th>
                      <th />
                      {cells(total)}
                    </tr>
                  </tfoot>
                </table>
              </div>
            }
          </>
        ))}
      {show && (
        <Modal
          open
          onClose={() => setShow(null)}
          width={820}
          title={`${{ leads: 'Leads', paid: 'Payments', booked: 'Booking', showed: 'Show up', closed: 'Converted', revenue: 'Revenue' }[show.k]} · ${show.r.label}`}
        >
          {(() => {
            const ls = show.r.ls.filter(pickOf(show.k))
            if (!ls.length) return <div className="muted small">No leads.</div>
            const sum = ls.reduce((t, l) => t + rev(l), 0)
            const dt = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
            const meetAt = (v?: string) =>
              v ? `${new Date(`${v.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · ${clockOf(v.slice(11))}` : '—'
            const none = <span className="muted">—</span>
            // the columns that matter for what was clicked
            type C = { label: string; num?: boolean; cell: (l: Lead) => ReactNode; foot?: ReactNode }
            const lead: C = {
              label: 'Lead',
              cell: (l) => (
                <>
                  <b>{who(l)}</b>
                  {(l.phone || l.email) && <div className="muted small">{[l.phone, l.email].filter(Boolean).join(' · ')}</div>}
                </>
              ),
              foot: `${ls.length} lead${ls.length === 1 ? '' : 's'}`,
            }
            const leadDate: C = { label: 'Lead date', cell: (l) => <span className="nowrap">{dt(l.created_at)}</span> }
            const revenue: C = { label: 'Revenue', num: true, cell: (l) => (rev(l) ? <b>{inr(rev(l))}</b> : none), foot: sum ? inr(sum) : '—' }
            const cols: C[] = {
              leads: [lead, leadDate],
              booked: [lead, leadDate, { label: 'Booking date', cell: (l: Lead) => <span className="nowrap">{meetAt(meet.booked.get(l.id))}</span> }],
              showed: [
                lead,
                leadDate,
                { label: 'Booking date', cell: (l: Lead) => <span className="nowrap">{meetAt(meet.booked.get(l.id))}</span> },
                { label: 'Show up date', cell: (l: Lead) => <span className="nowrap">{meetAt(meet.showed.get(l.id))}</span> },
              ],
              paid: [
                lead,
                leadDate,
                { label: 'Payment date', cell: (l: Lead) => <span className="nowrap">{money2.pays.get(l.id)?.last ? dt(money2.pays.get(l.id)!.last) : '—'}</span> },
                {
                  label: 'Paid',
                  num: true,
                  cell: (l: Lead) => {
                    const p = money2.pays.get(l.id)
                    return p?.n ? `${inr(p.amt)}${p.n > 1 ? ` · ${p.n}` : ''}` : none
                  },
                  foot: inr(ls.reduce((t, l) => t + (money2.pays.get(l.id)?.amt ?? 0), 0)),
                },
              ],
              closed: [lead, leadDate, revenue],
              revenue: [
                lead,
                leadDate,
                { label: 'Razorpay', num: true, cell: (l: Lead) => (money2.pays.get(l.id)?.n ? inr(money2.pays.get(l.id)!.amt) : none) },
                { label: 'Invoices', num: true, cell: (l: Lead) => (money2.billed.get(l.id) ? inr(money2.billed.get(l.id)!) : none) },
                revenue,
              ],
            }[show.k]
            return (
              <div className="table-wrap" style={{ maxHeight: '60vh', overflow: 'auto' }}>
                <table className="table table-compact">
                  <thead>
                    <tr>
                      {cols.map((c) => (
                        <th key={c.label} className={c.num ? 'num' : undefined}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ls.map((l) => (
                      <tr key={l.id} className="is-clickable" onClick={() => navigate(`/leads/${l.id}`)} title="Open the lead">
                        {cols.map((c) => (
                          <td key={c.label} className={c.num ? 'num nowrap' : undefined}>
                            {c.cell(l)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      {cols.map((c) => (
                        <th key={c.label} className={c.num ? 'num' : undefined}>
                          {c.foot}
                        </th>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          })()}
        </Modal>
      )}
    </section>
  )
}
