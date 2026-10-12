import { db } from '@/lib/supabase'
import type { CustomerRow, PaymentRow, SaleInput, SaleRow } from './types'

export async function listCustomers(tenantId: string): Promise<CustomerRow[]> {
  const { data, error } = await db().from('customers').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as CustomerRow[]
}

export async function listSales(tenantId: string): Promise<SaleRow[]> {
  const { data, error } = await db()
    .from('sales')
    .select('*, sale_dues(id, kind, seq, due_on, amount, paid_amount, status, reminded_at)')
    .eq('tenant_id', tenantId)
    .order('sale_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as SaleRow[]).map((s) => ({ ...s, sale_dues: [...s.sale_dues].sort((a, b) => a.seq - b.seq) }))
}

export async function listPayments(saleIds: string[]): Promise<PaymentRow[]> {
  if (!saleIds.length) return []
  const { data, error } = await db()
    .from('payments')
    .select('id, sale_id, amount, paid_on, payment_mode_id, reference, note, status, received_by, due_id, tds_amount, gateway_charge, verified')
    .in('sale_id', saleIds)
    .order('paid_on')
  if (error) throw error
  return (data ?? []) as PaymentRow[]
}

const num = (s: string) => (s.trim() === '' ? null : Number(s))

export async function createSale(tenantId: string, input: SaleInput) {
  const { data, error } = await db().rpc('create_sale', {
    p: {
      tenant_id: tenantId,
      business_id: input.business_id,
      customer_id: input.customer_id || null,
      lead_id: input.lead_id || null,
      customer: input.customer,
      sales_person_id: input.sales_person_id || null,
      notes: input.notes,
      product_id: input.product_id,
      quantity: Number(input.quantity) || 1,
      plan: input.plan,
      billing_company_id: input.billing_company_id,
      payment_mode_id: input.payment_mode_id || null,
      reference: input.reference,
      payment_remark: input.payment_remark,
      sale_date: input.sale_date,
      base_amount: num(input.base_amount),
      gst_applicable: input.gst_applicable,
      gst_rate: Number(input.gst_rate),
      received_now: input.plan === 'full' ? num(input.received_now) : null,
      token_amount: input.plan === 'booking' ? num(input.token_amount) : null,
      balance_due_on: input.balance_due_on || null,
      down_payment: input.plan === 'emi' ? num(input.down_payment) : null,
      emi_count: input.plan === 'emi' ? num(input.emi_count) : null,
      first_emi_on: input.plan === 'emi' ? input.first_emi_on || null : null,
    },
  })
  if (error)
    throw new Error(
      error.message.includes('row-level security') ? 'You don’t have permission to record this sale.' : error.message,
    )
  return data as string
}

export async function updateCustomer(id: string, patch: Partial<CustomerRow>) {
  const { error } = await db().from('customers').update(patch).eq('id', id)
  if (error) throw error
}

export async function addCustomer(tenantId: string, row: Record<string, unknown> & { business_id: string; full_name: string }) {
  const { error } = await db().from('customers').insert({ ...row, tenant_id: tenantId })
  if (error) throw error
}

export async function cancelSale(id: string, reason: string) {
  const { error } = await db()
    .from('sales')
    .update({ status: 'cancelled', cancel_reason: reason.trim(), cancelled_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  await db().from('sale_dues').update({ status: 'cancelled' }).eq('sale_id', id).eq('status', 'pending')
}

/** An existing customer of the business with this phone (only ones the person can see). */
export async function customerByPhone(tenantId: string, businessId: string, phone: string) {
  const digits = phone.replace(/\D/g, '').slice(-10)
  if (digits.length < 10) return null
  const { data } = await db()
    .from('customers')
    .select('id, full_name, phone')
    .eq('tenant_id', tenantId)
    .eq('business_id', businessId)
    .eq('is_archived', false)
    .ilike('phone', `%${digits.slice(0, 5)}%${digits.slice(5)}%`)
    .limit(1)
  return (data?.[0] ?? null) as { id: string; full_name: string; phone: string } | null
}
