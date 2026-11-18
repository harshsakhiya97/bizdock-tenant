import { BT, type Business } from '@/auth/auth-context'
import { db } from '@/lib/supabase'
import { purchaseTotals } from '@/webinars/api'

type Bk = { status: string; paid_amount: number | string; business_id: string; sub_business_id: string | null }

/** true for bookings of a Paid Podcast (sub-)business: a payment received makes the customer */
export function podcastCheck(businesses: Business[]) {
  // Default / Brand Deals: an order (not cancelled) makes the customer, paid or not
  const byPayment = (t: string | null | undefined) => t === BT.PAID_PODCAST
  const subs = new Set(businesses.flatMap((b) => b.subs.filter((x) => byPayment(x.type)).map((x) => x.id)))
  const whole = new Set(businesses.filter((b) => !b.subs.length && byPayment(b.type)).map((b) => b.id))
  return (b: Pick<Bk, 'business_id' | 'sub_business_id'>) => (b.sub_business_id ? subs.has(b.sub_business_id) : whole.has(b.business_id))
}

/**
 * The booking makes its lead a customer: a confirmed / completed booking; for Paid Podcast, a booking
 * (not cancelled) with any payment received.
 */
export function makesCustomer(b: Bk, isPodcast: (b: Bk) => boolean) {
  if (b.status === 'cancelled') return false
  if (isPodcast(b)) return Number(b.paid_amount) > 0
  return b.status === 'confirmed' || b.status === 'completed'
}

export type Revenue = {
  count: number
  billed: number
  paid: number
  /** the latest date (any) */
  last: string
  /** the first booking / order / purchase date: customer since */
  first: string
  /** the last date up to today, and the next one after today */
  lastPast: string
  next: string
  /** GST in the billed amount */
  gst: number
  /** studio time booked (bookings with a time) */
  hours: number
}
export const empty = (): Revenue => ({ count: 0, billed: 0, paid: 0, last: '', first: '', lastPast: '', next: '', gst: 0, hours: 0 })
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

/** Customers (see makesCustomer) and what they were billed and paid. */
export async function listCustomerRevenue(tenantId: string, businesses: Business[]): Promise<Map<string, Revenue>> {
  const isPodcast = podcastCheck(businesses)
  const { data, error } = await db()
    .from('bookings')
    .select('lead_id, total_amount, gst_amount, paid_amount, booking_date, start_time, end_time, status, business_id, sub_business_id')
    .eq('tenant_id', tenantId)
    .neq('status', 'cancelled')
    .not('lead_id', 'is', null)
  if (error) throw error
  const today = new Date().toLocaleDateString('en-CA')
  const m = new Map<string, Revenue>()
  const dated = (r: Revenue, d: string) => {
    if (d > r.last) r.last = d
    if (!r.first || d < r.first) r.first = d
    if (d <= today && d > r.lastPast) r.lastPast = d
    if (d > today && (!r.next || d < r.next)) r.next = d
  }
  type B = Bk & { lead_id: string; total_amount: number; gst_amount: number; paid_amount: number; booking_date: string; start_time: string; end_time: string }
  for (const b of (data ?? []) as B[]) {
    if (!makesCustomer(b, isPodcast)) continue
    const r = m.get(b.lead_id) ?? empty()
    r.count += 1
    r.billed += Number(b.total_amount)
    r.gst += Number(b.gst_amount)
    r.paid += Number(b.paid_amount)
    if (b.start_time && b.end_time && mins(b.end_time) > mins(b.start_time)) r.hours += (mins(b.end_time) - mins(b.start_time)) / 60
    dated(r, b.booking_date)
    m.set(b.lead_id, r)
  }
  // a lead who paid (part of) a purchase is a customer too (Webinar businesses)
  const bought = await purchaseTotals(tenantId).catch(() => new Map<string, { count: number; billed: number; paid: number; last: string }>())
  for (const [lead, p] of bought) {
    const r = m.get(lead) ?? empty()
    r.count += p.count
    r.billed += p.billed
    r.paid += p.paid
    if (p.last) dated(r, p.last)
    m.set(lead, r)
  }
  return m
}
