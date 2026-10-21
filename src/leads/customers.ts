import { db } from '@/lib/supabase'

export type Revenue = { count: number; billed: number; paid: number; last: string }

/** Leads with a confirmed / completed booking (= customers) and what they were billed and paid. */
export async function listCustomerRevenue(tenantId: string): Promise<Map<string, Revenue>> {
  const { data, error } = await db()
    .from('bookings')
    .select('lead_id, total_amount, paid_amount, booking_date')
    .eq('tenant_id', tenantId)
    .in('status', ['confirmed', 'completed'])
    .not('lead_id', 'is', null)
  if (error) throw error
  const m = new Map<string, Revenue>()
  for (const b of (data ?? []) as { lead_id: string; total_amount: number; paid_amount: number; booking_date: string }[]) {
    const r = m.get(b.lead_id) ?? { count: 0, billed: 0, paid: 0, last: '' }
    r.count += 1
    r.billed += Number(b.total_amount)
    r.paid += Number(b.paid_amount)
    if (b.booking_date > r.last) r.last = b.booking_date
    m.set(b.lead_id, r)
  }
  return m
}
