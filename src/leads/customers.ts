import { BT, type Business } from '@/auth/auth-context'
import { db } from '@/lib/supabase'
import { purchaseTotals } from '@/webinars/api'

type Bk = { status: string; paid_amount: number | string; business_id: string; sub_business_id: string | null }

/** true for bookings of a Paid Podcast (sub-)business */
export function podcastCheck(businesses: Business[]) {
  const subs = new Set(businesses.flatMap((b) => b.subs.filter((x) => x.type === BT.PAID_PODCAST).map((x) => x.id)))
  const whole = new Set(businesses.filter((b) => !b.subs.length && b.type === BT.PAID_PODCAST).map((b) => b.id))
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

export type Revenue = { count: number; billed: number; paid: number; last: string }

/** Customers (see makesCustomer) and what they were billed and paid. */
export async function listCustomerRevenue(tenantId: string, businesses: Business[]): Promise<Map<string, Revenue>> {
  const isPodcast = podcastCheck(businesses)
  const { data, error } = await db()
    .from('bookings')
    .select('lead_id, total_amount, paid_amount, booking_date, status, business_id, sub_business_id')
    .eq('tenant_id', tenantId)
    .neq('status', 'cancelled')
    .not('lead_id', 'is', null)
  if (error) throw error
  const m = new Map<string, Revenue>()
  for (const b of (data ?? []) as (Bk & { lead_id: string; total_amount: number; paid_amount: number; booking_date: string })[]) {
    if (!makesCustomer(b, isPodcast)) continue
    const r = m.get(b.lead_id) ?? { count: 0, billed: 0, paid: 0, last: '' }
    r.count += 1
    r.billed += Number(b.total_amount)
    r.paid += Number(b.paid_amount)
    if (b.booking_date > r.last) r.last = b.booking_date
    m.set(b.lead_id, r)
  }
  // a lead who paid (part of) a purchase is a customer too (Webinar businesses)
  const bought = await purchaseTotals(tenantId).catch(() => new Map<string, Revenue>())
  for (const [lead, p] of bought) {
    const r = m.get(lead) ?? { count: 0, billed: 0, paid: 0, last: '' }
    m.set(lead, { count: r.count + p.count, billed: r.billed + p.billed, paid: r.paid + p.paid, last: p.last > r.last ? p.last : r.last })
  }
  return m
}
