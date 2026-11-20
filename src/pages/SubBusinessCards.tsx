import { ArrowRight, LayoutGrid, TrendingDown, TrendingUp } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { BT, type Business } from '@/auth/auth-context'
import { useBusiness } from '@/business/useBusiness'
import type { BookingRow } from '@/bookings/types'
import type { FollowUpRow } from '@/followups/types'
import { makesCustomer, podcastCheck } from '@/leads/customers'
import { money } from '@/leads/labels'
import type { LeadRow } from '@/leads/types'
import { cn } from '@/lib/cn'

const COLORS = ['#dc2626', '#7c3aed', '#0891b2', '#d97706', '#16a34a', '#2563eb']
const pad = (n: number) => String(n).padStart(2, '0')
const shiftDay = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00`)
  x.setDate(x.getDate() + n)
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}
const short = (n: number) => (n >= 100000 ? `₹${(n / 100000).toFixed(n >= 1000000 ? 0 : 1)}L` : money(n))

/** Business level: one card per sub-business with its numbers for the date range. */
export function SubBusinessCards({
  business,
  from,
  to,
  leads,
  bookings,
  fus,
}: {
  business: Business
  from: string
  to: string
  leads: LeadRow[]
  bookings: BookingRow[]
  fus: FollowUpRow[]
}) {
  const { businesses, typeName } = useAuth()
  const { select } = useBusiness()
  const isPodcast = podcastCheck(businesses)
  // the same number of days just before the range, for the trend
  const days = Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000) + 1
  const pTo = shiftDay(from, -1)
  const pFrom = shiftDay(from, -days)
  const inR = (iso: string | null | undefined, a = from, b = to) => !!iso && iso.slice(0, 10) >= a && iso.slice(0, 10) <= b
  const now = new Date().toISOString()

  const cards = business.subs.map((s, i) => {
    const L = leads.filter((l) => !l.is_archived && l.business_id === business.id && l.sub_business_id === s.id)
    const ids = new Set(L.map((l) => l.id))
    const B = bookings.filter((b) => b.business_id === business.id && b.sub_business_id === s.id && b.status !== 'cancelled')
    const monthLeads = L.filter((l) => inR(l.created_at))
    const prevLeads = L.filter((l) => inR(l.created_at, pFrom, pTo)).length
    const customerIds = new Set(B.filter((b) => makesCustomer(b, isPodcast)).map((b) => b.lead_id))
    const customers = monthLeads.filter((l) => customerIds.has(l.id)).length
    const mb = B.filter((b) => inR(b.booking_date))
    const billed = mb.reduce((n, b) => n + Number(b.total_amount), 0)
    const collected = B.flatMap((b) => b.booking_payments).filter((p) => p.status === 'paid' && inR(p.paid_on)).reduce((n, p) => n + Number(p.amount), 0)
    const outstanding = B.filter((b) => makesCustomer(b, isPodcast)).reduce((n, b) => n + Math.max(0, b.total_amount - b.paid_amount), 0)
    const due = fus.filter((f) => ids.has(f.lead_id) && f.status === 'pending' && f.due_at <= now).length
    // enquiries vs the same number of days before
    const trend = !prevLeads && !monthLeads.length ? 'steady' : monthLeads.length > prevLeads * 1.1 ? 'up' : monthLeads.length < prevLeads * 0.9 ? 'down' : 'steady'
    return {
      s,
      color: COLORS[i % COLORS.length],
      type: typeName(s.type),
      enquiries: monthLeads.length,
      customers,
      bookings: mb.length,
      billed,
      collected,
      outstanding,
      due,
      trend,
      conv: monthLeads.length ? Math.round((customers / monthLeads.length) * 100) : 0,
      coll: billed ? Math.min(100, Math.round((collected / billed) * 100)) : 0,
    }
  })

  if (!cards.length) return null
  return (
    <div className="sb-grid">
      {cards.map((c) => (
        <article key={c.s.id} className="sb-card" style={{ ['--c' as string]: c.color }}>
          <div className="sb-head">
            <span className="sb-avatar">{c.s.name.slice(0, 1).toUpperCase()}</span>
            <div className="sb-title">
              <b>{c.s.name}</b>
              <span className="muted small">{c.type}</span>
            </div>
            <button type="button" className="btn btn-ghost btn-icon" title="Open its dashboard" aria-label={`Open ${c.s.name} dashboard`} onClick={() => select(business.id, c.s.id)}>
              <LayoutGrid size={17} />
            </button>
          </div>
          <div className="sb-meta">
            <span className={cn('sb-trend', `is-${c.trend}`)}>
              {c.trend === 'up' ? <TrendingUp size={14} /> : c.trend === 'down' ? <TrendingDown size={14} /> : <ArrowRight size={14} />}
              {c.trend === 'up' ? 'Growing' : c.trend === 'down' ? 'Slowing down' : 'Steady'}
            </span>
          </div>
          <div className="sb-tiles">
            <div>
              <small>Leads</small>
              <b>{c.enquiries}</b>
            </div>
            <div>
              <small>Customers</small>
              <b className="tone-info">{c.customers}</b>
            </div>
            <div>
              <small>{c.s.type === BT.PAID_PODCAST ? 'Podcasts' : 'Bookings'}</small>
              <b>{c.bookings}</b>
            </div>
            <div>
              <small>Billed</small>
              <b>{short(c.billed)}</b>
            </div>
            <div>
              <small>Collected</small>
              <b className="tone-success">{short(c.collected)}</b>
            </div>
            <div>
              <small>Outstanding</small>
              <b className={c.outstanding ? 'tone-warning' : undefined}>{short(c.outstanding)}</b>
            </div>
          </div>
          <div className="sb-bars">
            <span>Converted</span>
            <div className="db-bar">
              <span style={{ width: `${c.conv}%`, background: 'var(--brand)' }} />
            </div>
            <b>{c.conv}%</b>
            <span>Collected</span>
            <div className="db-bar">
              <span style={{ width: `${c.coll}%`, background: c.coll >= 70 ? 'var(--success)' : c.coll >= 40 ? '#d97706' : 'var(--danger, #dc2626)' }} />
            </div>
            <b>{c.coll}%</b>
          </div>
          <div className="sb-foot">
            <span className={cn('small', c.due ? 'tone-danger' : 'muted')}>{c.due} follow-up{c.due === 1 ? '' : 's'} due</span>
            <button type="button" className="sb-open" onClick={() => select(business.id, c.s.id)}>
              Open dashboard →
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}
