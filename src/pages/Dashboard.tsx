import { BT } from '@/auth/auth-context'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Phone, Plus, SquarePen } from 'lucide-react'
import { DateRangePicker, presetRange, type Range } from '@/components/DateRange'
import { makesCustomer, podcastCheck } from '@/leads/customers'
import { useAuth } from '@/auth/useAuth'
import { useBusiness } from '@/business/useBusiness'
import { activeType } from '@/business/activeType'
import { PodcastDashboard } from './PodcastDashboard'
import { CourseDashboard } from './CourseDashboard'
import { listInvoices, withInvoicePayments } from '@/invoices/api'
import { BusinessCards } from './BusinessCards'
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
const dm = (d: string, year = false) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) })
/** 1 Nov – 20 Nov 2026 (or one day) */
const rangeText = (r: Range) => (r.from === r.to ? dm(r.from, true) : `${dm(r.from, r.from.slice(0, 4) !== r.to.slice(0, 4))} – ${dm(r.to, true)}`)
const dayMonth = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
const hoursOf = (b: BookingRow) => {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  return Math.max(0, (m(b.end_time) - m(b.start_time)) / 60)
}

/** Paid Podcast has its own dashboard; everything else gets the month dashboard below. */
export function DashboardPage() {
  const { selected, sub } = useBusiness()
  const tenant = useTenant()
  const t = activeType(selected, sub)
  // course workspaces (opt-in, e.g. BGR): the course dashboard for their Webinar business, or with all businesses shown
  if (tenant.extra_pages?.includes('course-dashboard') && (!t || t === BT.WEBINAR)) return <CourseDashboard />
  return t === BT.PAID_PODCAST ? <PodcastDashboard /> : <MonthDashboard />
}

/** Month dashboard: enquiries, action required, follow-ups, bookings, money collected and enquiry sources. */
function MonthDashboard() {
  const tenant = useTenant()
  const navigate = useNavigate()
  const { can, businesses } = useAuth()
  const { selected, sub, inScope } = useBusiness()
  const refs = useBookingRefs()
  const today = isoDay(new Date())
  // default: this month, the 1st till today
  const [range, setRange] = useState<Range>(() => presetRange('thisMonth'))
  const { from, to } = range
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
    if (can('bookings', 'view'))
      Promise.all([listBookings(tenant.id), listInvoices(tenant.id).catch(() => [])]).then(
        ([b, inv]) => setBookings(withInvoicePayments(b, inv)),
        () => setBookings([]),
      )
  }, [tenant.id, can])
  useEffect(load, [load])

  const d = useMemo(() => {
    const L = (leads ?? []).filter((l) => !l.is_archived && inScope(l.business_id, l.sub_business_id))
    const leadIds = new Set(L.map((l) => l.id))
    const B = bookings.filter((b) => inScope(b.business_id, b.sub_business_id) && b.status !== 'cancelled')
    const F = fus.filter((f) => leadIds.has(f.lead_id))
    const inMonth = (iso: string | null | undefined) => !!iso && iso.slice(0, 10) >= from && iso.slice(0, 10) <= to
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
    const mb = B.filter((b) => inMonth(b.booking_date))
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
    const split = (fn: (bd: string) => boolean) => {
      const ps = paidInMonth.filter((p) => fn(p.booking.booking_date.slice(0, 10)))
      return { amount: ps.reduce((s, p) => s + Number(p.amount), 0), count: ps.length }
    }
    const fromThis = split((bd) => bd >= from && bd <= to)
    const fromPrev = split((bd) => bd < from)
    const advance = split((bd) => bd > to)

    // enquiry → customer: this month's enquiries with a confirmed / completed booking
    const converted = customersThisMonth

    // sources this month
    const src = new Map<string, number>()
    for (const l of monthLeads) {
      const name = refs.sources.find((s) => s.id === l.source_id)?.name ?? 'Other'
      src.set(name, (src.get(name) ?? 0) + 1)
    }
    const sources = [...src.entries()].sort((a, b) => b[1] - a[1])

    // from today till the end of the range's last month
    const [ty, tm] = to.split('-').map(Number)
    const monthEnd = isoDay(new Date(ty, tm, 0))
    const shoots = B.filter((b) => b.booking_date >= today && b.booking_date >= from && b.booking_date <= monthEnd).sort((a, b) =>
      (a.booking_date + a.start_time).localeCompare(b.booking_date + b.start_time),
    )

    return { monthLeads, open, lost, action, logged, mb, completed, upcoming, hours, collected, billed, pendingMonth, outstanding, fromThis, fromPrev, advance, converted, sources, shoots, stageKind }
  }, [leads, fus, bookings, refs.funnels, refs.sources, inScope, from, to, today, businesses])

  const ml = rangeText(range)
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
          <DateRangePicker value={range} onChange={setRange} future />
          <span className="muted">
            {title} · showing <b>{ml}</b>
          </span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {can('leads', 'add') && (
            <button type="button" className="btn btn-outline" onClick={() => setAdding(true)}>
              <Plus size={15} /> New lead
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

      {!selected && businesses.length > 1 && <BusinessCards from={from} to={to} leads={leads} bookings={bookings} fus={fus} />}

      <div className="db-cards">
        <Link to="/leads" className="db-card">
          <b>{d.monthLeads.length}</b>
          <span>Leads · {ml}</span>
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
          <span>Lead to customer</span>
          <small>
            {d.converted} of {d.monthLeads.length} leads in {ml} became customers
          </small>
        </Link>
      </div>

      <section className="card card-pad db-section">
        <div className="db-head">
          <h3>
            Collections breakdown <span className="muted small">· cash received in {ml}, by booking date</span>
          </h3>
        </div>
        <div className="db-cards db-cards-4">
          <div className="db-card">
            <b className="tone-success">{money(d.fromThis.amount)}</b>
            <span>From bookings in this range</span>
            <small>{d.fromThis.count} payments · shoots in {ml}</small>
          </div>
          <div className="db-card">
            <b className="tone-success">{money(d.fromPrev.amount)}</b>
            <span>From previous bookings</span>
            <small>{d.fromPrev.count} payments · shoots before {dm(from, true)}</small>
          </div>
          <div className="db-card">
            <b>{money(d.advance.amount)}</b>
            <span>Advance for upcoming</span>
            <small>{d.advance.count} payments · shoots after {dm(to, true)}</small>
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
              {d.action.length} lead{d.action.length === 1 ? ' needs' : 's need'} a call
            </span>
          </div>
          {!d.action.length ? (
            <div className="muted small card-pad">Nothing to do right now.</div>
          ) : (
            <div className="table-wrap">
              <table className="table db-table">
                <thead>
                  <tr>
                    <th>Lead</th>
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
                {d.shoots.length} till {dm(isoDay(new Date(Number(to.slice(0, 4)), Number(to.slice(5, 7)), 0)), true)}
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
                Lead sources <span className="muted small">· {ml}</span>
              </h3>
            </div>
            {!d.sources.length ? (
              <div className="muted">No leads in {ml}.</div>
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
