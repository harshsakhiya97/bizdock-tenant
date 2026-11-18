import { useEffect, useMemo, useState } from 'react'
import { Filter, List } from 'lucide-react'
import { funnelAdsReport, funnelFlow, type AdsReport, type FunnelFlow as Flow } from '@/meta/api'
import { FunnelFlow } from './FunnelFlow'
import { MetaSync } from './MetaSync'
import { DateRangePicker, presetRange, type Range } from '@/components/DateRange'
import { useTenant } from '@/tenant/useTenant'
import { db } from '@/lib/supabase'

const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const iso = (d: Date) => d.toLocaleDateString('en-CA')
const at = (s: string) => new Date(`${s}T00:00:00`)
const short = (s: string) => at(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
/** a lead's day: its creation date in India time */
const leadDay = (ts: string) => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

type By = 'day' | 'week' | 'month'
type Row = { key: string; label: string; sub?: string; spend: number; gst: number; leads: number; booked: number; showed: number }

/**
 * Funnel → Overview: the 3D funnel (Facebook reach → clicks → page views → leads → stages → revenue) and its numbers, for a
 * period; or the List: spend (with GST), leads (by their creation date) and CPL per day / week / month.
 */
export function FunnelAdsReport({ funnelId, leads }: { funnelId: string; leads?: { id: string; created_at: string; is_archived?: boolean }[] | null }) {
  const tenant = useTenant()
  // same presets as Facebook Ads Manager (Last 30 days ends yesterday), so the numbers match
  const [range, setRange] = useState<Range>(() => presetRange('last30'))
  const { from, to } = range
  const [reload, setReload] = useState(0)
  const [view, setView] = useState<'funnel' | 'list'>('funnel')
  const [by, setBy] = useState<By>('day')
  const [flow, setFlow] = useState<Flow | null | undefined>(undefined)
  const [report, setReport] = useState<AdsReport | null>(null)
  // with GST ÷ without, from Facebook's days (each ad account has its own GST %)
  const [gst, setGst] = useState(1.18)
  const [error, setError] = useState<string | null>(null)
  // the funnel's leads with a meeting (Booking) and with a meeting done (Showup)
  const [meet, setMeet] = useState<{ booked: Set<string>; showed: Set<string> }>({ booked: new Set(), showed: new Set() })
  const ids = useMemo(() => (leads ?? []).map((l) => l.id), [leads])
  useEffect(() => {
    if (!ids.length) return
    let live = true
    void (async () => {
      const booked = new Set<string>()
      const showed = new Set<string>()
      for (let i = 0; i < ids.length; i += 300) {
        const { data } = await db().from('meetings').select('lead_id, status').eq('tenant_id', tenant.id).in('lead_id', ids.slice(i, i + 300))
        for (const m of (data ?? []) as { lead_id: string; status: string }[]) {
          if (m.status === 'cancelled') continue
          booked.add(m.lead_id)
          if (m.status === 'done') showed.add(m.lead_id)
        }
      }
      if (live) setMeet({ booked, showed })
    })()
    return () => {
      live = false
    }
  }, [ids, tenant.id, reload])

  useEffect(() => {
    setFlow(undefined)
    setReport(null)
    setError(null)
    funnelFlow(funnelId, from, to).then(setFlow, (e: Error) => setError(e.message))
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
  }, [funnelId, from, to, reload])

  // every day / week (Mon–Sun) / month in the dates picked, with its spend and the leads created in it
  const rows = useMemo(() => {
    if (!from || !to) return [] as Row[]
    const spend = new Map((report?.days ?? []).map((d) => [d.day, { s: Number(d.spend) || 0, g: Number(d.spend_gst) || 0 }]))
    const made = new Map<string, { n: number; b: number; s: number }>()
    for (const l of leads ?? []) {
      if (l.is_archived) continue
      const d = leadDay(l.created_at)
      if (d < from || d > to) continue
      const c = made.get(d) ?? { n: 0, b: 0, s: 0 }
      c.n++
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
      const r = out.get(key) ?? { key, label, sub, spend: 0, gst: 0, leads: 0, booked: 0, showed: 0 }
      r.spend += spend.get(day)?.s ?? 0
      r.gst += spend.get(day)?.g ?? 0
      r.leads += made.get(day)?.n ?? 0
      r.booked += made.get(day)?.b ?? 0
      r.showed += made.get(day)?.s ?? 0
      out.set(key, r)
    }
    // newest first
    return [...out.values()].reverse()
  }, [report, leads, meet, from, to, by])
  const total = rows.reduce(
    (t, r) => ({ spend: t.spend + r.spend, gst: t.gst + r.gst, leads: t.leads + r.leads, booked: t.booked + r.booked, showed: t.showed + r.showed }),
    { spend: 0, gst: 0, leads: 0, booked: 0, showed: 0 },
  )
  const money = (gstAmt: number, ex: number) => (
    <span title={ex ? `${inr(ex)} without GST + ${inr(gstAmt - ex)} GST` : undefined}>{gstAmt ? inr(gstAmt) : '—'}</span>
  )
  const cpl = (gstAmt: number, ex: number, n: number) =>
    n && gstAmt ? <span title={`${inr(ex / n)} without GST`}>{inr(gstAmt / n)}</span> : <span className="muted">—</span>

  return (
    <section className="card card-pad stack" style={{ gap: 14 }}>
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <b>Funnel report</b>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <MetaSync tenantId={tenant.id} onDone={() => setReload((n) => n + 1)} />
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
              {!flow.linked && <div className="muted small">No Facebook campaigns are added to this funnel yet (Facebook Ads tab), so there’s no ad reach or spend.</div>}
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
            <div className="muted small">Amount spent with GST (hover: without GST + GST) · Leads by the date they were created · CPL = amount spent ÷ leads · Booking = those leads with a meeting · Showup = those leads whose meeting was done.</div>
            {/* every row, no paging */}
            {(
                <div className="table-wrap">
                  <table className="table table-compact">
                    <thead>
                      <tr>
                        <th>{by === 'day' ? 'Date' : by === 'week' ? 'Week' : 'Month'}</th>
                        <th className="num">Amount spent</th>
                        <th className="num">Leads</th>
                        <th className="num">CPL</th>
                        <th className="num">Booking</th>
                        <th className="num">Showup</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.key}>
                          <td>
                            {r.label}
                            {r.sub && <div className="muted small">{r.sub}</div>}
                          </td>
                          <td className="num">{money(r.gst, r.spend)}</td>
                          <td className="num">{r.leads || <span className="muted">0</span>}</td>
                          <td className="num">{cpl(r.gst, r.spend, r.leads)}</td>
                          <td className="num">{r.booked || <span className="muted">0</span>}</td>
                          <td className="num">{r.showed || <span className="muted">0</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th>Total</th>
                        <th className="num">{money(total.gst, total.spend)}</th>
                        <th className="num">{total.leads}</th>
                        <th className="num">{cpl(total.gst, total.spend, total.leads)}</th>
                        <th className="num">{total.booked}</th>
                        <th className="num">{total.showed}</th>
                      </tr>
                    </tfoot>
                  </table>
                </div>
            )}
          </>
        ))}
    </section>
  )
}
