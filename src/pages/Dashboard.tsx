import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChevronLeft, ChevronRight, Phone, Plus, SquarePen } from 'lucide-react'
import { makesCustomer, podcastCheck } from '@/leads/customers'
import { useAuth } from '@/auth/useAuth'
import { useBusiness } from '@/business/useBusiness'
import { activeType } from '@/business/activeType'
import { PodcastDashboard } from './PodcastDashboard'
import { listBookings } from '@/bookings/api'
import { BookingDrawer } from '@/bookings/BookingDrawer'
import type { BookingRow } from '@/bookings/types'
import { useBookingRefs } from '@/bookings/useBookingRefs'
import { Flash } from '@/components/Flash'
import { listFollowUps } from '@/followups/api'
import type { FollowUpRow } from '@/followups/types'
import { listLeads } from '@/leads/api'
import { fullName, money } from '@/leads/labels'
import { QuickAddLead } from '@/leads/QuickAddLead'
import type { LeadRow } from '@/leads/types'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'

const pad = (n: number) => String(n).padStart(2, '0')
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
const shortMonth = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
const dayMonth = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
const hoursOf = (b: BookingRow) => {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  return Math.max(0, (m(b.end_time) - m(b.start_time)) / 60)
}

/** Paid Podcast has its own dashboard; everything else gets the month dashboard below. */
export function DashboardPage() {
  const { selected, sub } = useBusiness()
  return activeType(selected, sub) === 'podcast' ? <PodcastDashboard /> : <MonthDashboard />
}

/** Month dashboard: enquiries, action required, follow-ups, bookings, money collected and enquiry sources. */
function MonthDashboard() {
  const tenant = useTenant()
  const navigate = useNavigate()
  const { can, businesses } = useAuth()
  const { selected, sub, inScope } = useBusiness()
  const refs = useBookingRefs()
  const today = isoDay(new Date())
  const [month, setMonth] = useState(today.slice(0, 7))
  const [leads, setLeads] = useState<LeadRow[] | null>(null)
  const [fus, setFus] = useState<FollowUpRow[]>([])
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [adding, setAdding] = useState(false)
  const [book, setBook] = useState<{ lead: LeadRow | null; booking?: BookingRow } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(() => {
    listLeads(tenant.id).then(setLeads, () => setLeads([]))
    listFollowUps(tenant.id).then(setFus, () => setFus([]))
    if (can('bookings', 'view')) listBookings(tenant.id).then(setBookings, () => setBookings([]))
  }, [tenant.id, can])
  useEffect(load, [load])

  const d = useMemo(() => {
    const L = (leads ?? []).filter((l) => !l.is_archived && inScope(l.business_id, l.sub_business_id))
    const leadIds = new Set(L.map((l) => l.id))
    const B = bookings.filter((b) => inScope(b.business_id, b.sub_business_id) && b.status !== 'cancelled')
    const F = fus.filter((f) => leadIds.has(f.lead_id))
    const inMonth = (iso: string | null | undefined) => !!iso && iso.slice(0, 7) === month
    const stageKind = new Map(refs.funnels.flatMap((f) => f.funnel_stages.map((s) => [s.id, s] as const)))
    // same rule as the Customers page (Paid Podcast: once a payment is received)
    const isPodcast = podcastCheck(businesses)
    const customerIds = new Set(B.filter((b) => makesCustomer(b, isPodcast)).map((b) => b.lead_id).filter(Boolean))
    const isLost = (l: LeadRow) => stageKind.get(l.stage_id ?? '')?.kind === 'lost'
    const isClosed = (l: LeadRow) => customerIds.has(l.id) || isLost(l) || stageKind.get(l.stage_id ?? '')?.kind === 'won'

    // enquiries
    const monthLeads = L.filter((l) => inMonth(l.created_at))
    const open = L.filter((l) => !isClosed(l)).length
    const lost = monthLeads.filter((l) => !customerIds.has(l.id) && isLost(l)).length
    const customersThisMonth = monthLeads.filter((l) => customerIds.has(l.id)).length

    // action required: open leads with a pending follow-up due by today, or never contacted
    const fuByLead = new Map<string, FollowUpRow[]>()
    for (const f of F) fuByLead.set(f.lead_id, [...(fuByLead.get(f.lead_id) ?? []), f])
    const action = L.filter((l) => !isClosed(l))
      .map((l) => {
        const list = fuByLead.get(l.id) ?? []
        const logged = list.filter((f) => f.status === 'done').length
        const due = list.filter((f) => f.status === 'pending').sort((a, b) => a.due_at.localeCompare(b.due_at))[0]
        const when = due?.due_at ?? (logged ? null : l.created_at)
        return { lead: l, due, logged, when }
      })
      .filter((x) => x.when && x.when.slice(0, 10) <= today)
      .sort((a, b) => (a.when ?? '').localeCompare(b.when ?? ''))

    // follow-ups done this month
    const logged = F.filter((f) => f.status === 'done' && inMonth(f.completed_at ?? f.due_at)).length

    // bookings this month
    const mb = B.filter((b) => b.booking_date.slice(0, 7) === month)
    const completed = mb.filter((b) => b.status === 'completed').length
    const upcoming = mb.filter((b) => b.booking_date >= today && b.status !== 'completed')
    const hours = mb.reduce((s, b) => s + hoursOf(b), 0)

    // money
    const pays = B.flatMap((b) => b.booking_payments.map((p) => ({ ...p, booking: b })))
    const paidInMonth = pays.filter((p) => p.status === 'paid' && inMonth(p.paid_on))
    const collected = paidInMonth.reduce((s, p) => s + Number(p.amount), 0)
    const billed = mb.reduce((s, b) => s + Number(b.total_amount), 0)
    const pendingMonth = mb.reduce((s, b) => s + Math.max(0, b.total_amount - b.paid_amount), 0)
    const outstanding = B.filter((b) => b.status === 'confirmed' || b.status === 'completed').reduce((s, b) => s + Math.max(0, b.total_amount - b.paid_amount), 0)
    const split = (fn: (bm: string) => boolean) => {
      const ps = paidInMonth.filter((p) => fn(p.booking.booking_date.slice(0, 7)))
      return { amount: ps.reduce((s, p) => s + Number(p.amount), 0), count: ps.length }
    }
    const fromThis = split((bm) => bm === month)
    const fromPrev = split((bm) => bm < month)
    const advance = split((bm) => bm > month)

    // enquiry → customer: this month's enquiries with a confirmed / completed booking
    const converted = customersThisMonth

    // sources this month
    const src = new Map<string, number>()
    for (const l of monthLeads) {
      const name = refs.sources.find((s) => s.id === l.source_id)?.name ?? 'Other'
      src.set(name, (src.get(name) ?? 0) + 1)
    }
    const sources = [...src.entries()].sort((a, b) => b[1] - a[1])

    const monthEnd = `${month}-31`
    const shoots = B.filter((b) => b.booking_date >= today && b.booking_date <= monthEnd && b.booking_date.slice(0, 7) === month).sort((a, b) =>
      (a.booking_date + a.start_time).localeCompare(b.booking_date + b.start_time),
    )

    return { monthLeads, open, lost, action, logged, mb, completed, upcoming, hours, collected, billed, pendingMonth, outstanding, fromThis, fromPrev, advance, converted, sources, shoots, stageKind }
  }, [leads, fus, bookings, refs.funnels, refs.sources, inScope, month, today, businesses])

  const shiftMonth = (dir: number) => {
    const [y, m] = month.split('-').map(Number)
    const n = new Date(y, m - 1 + dir, 1)
    setMonth(`${n.getFullYear()}-${pad(n.getMonth() + 1)}`)
  }
  const ml = shortMonth(month)
  const title = sub?.name ?? selected?.name ?? 'Dashboard'
  const pct = d.monthLeads.length ? Math.round((d.converted / d.monthLeads.length) * 100) : 0
  const maxSrc = Math.max(1, ...d.sources.map(([, n]) => n))
  const rows = showAll ? d.action : d.action.slice(0, 25)
  const daysAgo = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000))

  if (!leads) return <div className="empty">Loading…</div>

  return (
    <>
      <div className="db-top">
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-outline btn-icon" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
            <ChevronLeft size={16} />
          </button>
          <input className="input db-month" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" />
          <button type="button" className="btn btn-outline btn-icon" aria-label="Next month" onClick={() => shiftMonth(1)}>
            <ChevronRight size={16} />
          </button>
          <span className="muted">
            {title} · showing <b>{monthLabel(month)}</b>
          </span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {can('leads', 'add') && (
            <button type="button" className="btn btn-outline" onClick={() => setAdding(true)}>
              <Plus size={15} /> New enquiry
            </button>
          )}
          {can('bookings', 'add') && (
            <button type="button" className="btn btn-primary" onClick={() => setBook({ lead: null })}>
              <Plus size={15} /> New booking
            </button>
          )}
        </div>
      </div>
      <Flash msg={notice} />

      <div className="db-cards">
        <Link to="/leads" className="db-card">
          <b>{d.monthLeads.length}</b>
          <span>Enquiries · {ml}</span>
          <small>
            {d.converted} converted to customers · {d.open} open · {d.lost} lost
          </small>
        </Link>
        <a href="#action" className="db-card">
          <b className="tone-danger">{d.action.length}</b>
          <span>Action required</span>
          <small>Due today, overdue or never contacted</small>
        </a>
        <Link to="/follow-ups" className="db-card">
          <b>{d.logged}</b>
          <span>Follow-ups logged · {ml}</span>
          <small>Calls and conversations recorded</small>
        </Link>
        <Link to="/bookings" className="db-card">
          <b className="tone-info">{d.mb.length}</b>
          <span>Bookings · {ml}</span>
          <small>
            {d.completed} completed · {d.upcoming.length} upcoming · {Math.round(d.hours * 10) / 10} hrs
          </small>
        </Link>
        <div className="db-card">
          <b className="tone-success">{money(d.collected)}</b>
          <span>Revenue collected · {ml}</span>
          <small>Cash received by payment date</small>
        </div>
        <div className="db-card">
          <b>{money(d.billed)}</b>
          <span>Billed · {ml}</span>
          <small>Pending on these bookings {money(d.pendingMonth)}</small>
        </div>
        <div className="db-card">
          <b className="tone-warning">{money(d.outstanding)}</b>
          <span>Outstanding balance (all)</span>
          <small>Across all confirmed bookings</small>
        </div>
        <Link to="/customers" className="db-card">
          <b>{pct}%</b>
          <span>Enquiry to customer</span>
          <small>
            {d.converted} of {d.monthLeads.length} enquiries this month became customers
          </small>
        </Link>
      </div>

      <section className="card card-pad db-section">
        <div className="db-head">
          <h3>
            Collections breakdown <span className="muted small">· cash received in {ml}, by booking month</span>
          </h3>
        </div>
        <div className="db-cards db-cards-4">
          <div className="db-card">
            <b className="tone-success">{money(d.fromThis.amount)}</b>
            <span>From {ml} bookings</span>
            <small>{d.fromThis.count} payments · shoots this month</small>
          </div>
          <div className="db-card">
            <b className="tone-success">{money(d.fromPrev.amount)}</b>
            <span>From previous bookings</span>
            <small>{d.fromPrev.count} payments · earlier shoots</small>
          </div>
          <div className="db-card">
            <b>{money(d.advance.amount)}</b>
            <span>Advance for upcoming</span>
            <small>{d.advance.count} payments · later shoots</small>
          </div>
          <div className="db-card">
            <b className="tone-success">{money(d.collected)}</b>
            <span>Total cash received</span>
            <small>All payment modes</small>
          </div>
        </div>
      </section>

      <div className="db-grid">
        <section className="card db-section" id="action">
          <div className="db-head card-pad" style={{ paddingBottom: 8 }}>
            <h3>Action required</h3>
            <span className="muted small">
              {d.action.length} enquir{d.action.length === 1 ? 'y needs' : 'ies need'} a call
            </span>
          </div>
          {!d.action.length ? (
            <div className="muted small card-pad">Nothing to do right now.</div>
          ) : (
            <div className="table-wrap">
              <table className="table db-table">
                <thead>
                  <tr>
                    <th>Enquiry</th>
                    <th>Source</th>
                    <th>Follow-up</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ lead: l, due, logged, when }) => {
                    const late = when ? daysAgo(when) : 0
                    const stage = d.stageKind.get(l.stage_id ?? '')
                    return (
                      <tr key={l.id}>
                        <td>
                          <Link to={`/leads/${l.id}`} className="db-name">
                            {fullName(l)}
                          </Link>
                          <div className="muted small nowrap">{l.phone}</div>
                          {l.purpose && <div className="muted small">{l.purpose}</div>}
                        </td>
                        <td className="small">{refs.sources.find((s) => s.id === l.source_id)?.name ?? '—'}</td>
                        <td>
                          <div className={cn('small', late > 0 ? 'tone-danger' : 'tone-warning')} style={{ fontWeight: 600 }}>
                            {when ? dayMonth(when) : '—'}
                            {late > 0 ? ` · Overdue ${late}d` : ' · Today'}
                          </div>
                          {!due && !logged && <div className="muted small">not contacted yet</div>}
                          {logged > 0 && <div className="muted small">{logged} logged</div>}
                        </td>
                        <td>
                          <span className={cn('badge', logged ? 'badge-warning' : 'badge-info')}>{logged ? (stage?.name ?? 'Follow-up') : 'New'}</span>
                        </td>
                        <td className="nowrap" style={{ textAlign: 'right' }}>
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate(`/leads/${l.id}?tab=followups`)}>
                            <Phone size={13} /> Follow-up
                          </button>{' '}
                          {can('bookings', 'add') && (
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => setBook({ lead: l })}>
                              <SquarePen size={13} /> Book
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {d.action.length > 25 && (
            <div className="card-pad" style={{ paddingTop: 10 }}>
              <button type="button" className="link-btn" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show fewer' : `View all ${d.action.length} →`}
              </button>
            </div>
          )}
        </section>

        <div className="stack">
          <section className="card card-pad db-section">
            <div className="db-head">
              <h3>Upcoming shoots</h3>
              <span className="muted small">
                {d.shoots.length} in {ml}
              </span>
            </div>
            {!d.shoots.length ? (
              <div className="muted">No shoots scheduled from today to month end.</div>
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                {d.shoots.map((b) => (
                  <button key={b.id} type="button" className="db-shoot" onClick={() => setBook({ lead: null, booking: b })}>
                    <b>{b.client_name}</b>
                    <span className="muted small">
                      {new Date(`${b.booking_date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · {b.start_time.slice(0, 5)}–{b.end_time.slice(0, 5)}
                      {b.purpose ? ` · ${b.purpose}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="card card-pad db-section">
            <div className="db-head">
              <h3>
                Enquiry sources <span className="muted small">· {ml}</span>
              </h3>
            </div>
            {!d.sources.length ? (
              <div className="muted">No enquiries this month.</div>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {d.sources.map(([name, n]) => (
                  <div key={name} className="db-src">
                    <span className="small">{name}</span>
                    <div className="db-bar">
                      <span style={{ width: `${(n / maxSrc) * 100}%` }} />
                    </div>
                    <b className="small">{n}</b>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {adding && (
        <QuickAddLead
          funnels={refs.funnels}
          defaultFunnelId={null}
          sources={refs.sources}
          onClose={() => setAdding(false)}
          onAdded={(id) => navigate(`/leads/${id}`)}
        />
      )}
      {book && (
        <BookingDrawer
          key={book.booking?.id ?? book.lead?.id ?? 'new'}
          booking={book.booking ?? null}
          lead={
            book.lead
              ? { id: book.lead.id, name: fullName(book.lead), phone: book.lead.phone, purpose: book.lead.purpose, business_id: book.lead.business_id, sub_business_id: book.lead.sub_business_id }
              : null
          }
          leads={book.lead ? undefined : (leads ?? [])}
          refs={refs}
          onClose={() => setBook(null)}
          onSaved={(msg) => {
            setBook(null)
            setNotice(msg)
            load()
          }}
        />
      )}
    </>
  )
}
