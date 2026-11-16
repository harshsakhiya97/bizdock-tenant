import { db } from '@/lib/supabase'
import type { PartDraft } from '@/bookings/types'
import type { InvoiceInput, InvoiceRow } from './types'

const COLS = '*, invoice_payments(*), bookings(*, booking_items(*), booking_payments(*))'
const num = (v: string) => (v.trim() ? Math.max(0, Number(v)) : 0)

export async function listInvoices(tenantId: string, f: { leadId?: string } = {}): Promise<InvoiceRow[]> {
  let q = db().from('invoices').select(COLS).eq('tenant_id', tenantId)
  if (f.leadId) q = q.eq('lead_id', f.leadId)
  const { data, error } = await q.order('invoice_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as InvoiceRow[]
}

export async function getInvoice(id: string): Promise<InvoiceRow | null> {
  const { data, error } = await db().from('invoices').select(COLS).eq('id', id).maybeSingle()
  if (error) throw error
  return (data as InvoiceRow | null) ?? null
}

const partJson = (p: PartDraft) => ({ label: p.label, due_on: p.due_on, amount: num(p.amount), status: p.status, paid_on: p.paid_on, mode: p.mode, note: p.note })

/** one invoice for orders of one client: GST and the payment parts */
export async function createInvoice(orderIds: string[], input: InvoiceInput) {
  const { data, error } = await db().rpc('invoice_create', {
    p_orders: orderIds,
    p_kind: input.kind,
    p_company: input.billing_company_id || null,
    p_rate: Number(input.gst_rate) || 18,
    p_buyer: input.buyer,
    p_parts: input.parts.filter((p) => num(p.amount) > 0).map(partJson),
  })
  if (error) throw new Error(error.message)
  return data as string
}

/** GST / billing company and the payment plan of an invoice */
export async function saveInvoice(tenantId: string, memberId: string | undefined, inv: InvoiceRow, input: InvoiceInput) {
  // GST first (the database moves the change onto the last unpaid part), then the plan as entered here wins
  // the type and company stay (the number is from that company); a GST invoice's rate can change
  const rate = Number(input.gst_rate) || 18
  if (inv.kind === 'gst' && rate !== Number(inv.gst_rate)) {
    const { error } = await db().from('invoices').update({ gst_rate: rate }).eq('id', inv.id)
    if (error) throw new Error(error.message)
  }
  const b = inv.buyer ?? {}
  if ((['company', 'address', 'state', 'state_code', 'gstin'] as const).some((k) => (b[k] ?? '') !== input.buyer[k].trim())) {
    const { error } = await db().rpc('invoice_set_buyer', { p_invoice: inv.id, p_buyer: input.buyer })
    if (error) throw new Error(error.message)
  }
  const now = await db().from('invoice_payments').select('id, status').eq('invoice_id', inv.id)
  if (now.error) throw new Error(now.error.message)
  const keep = new Set(input.parts.map((p) => p.id).filter(Boolean))
  const gone = (now.data ?? []).filter((p) => !keep.has(p.id)).map((p) => p.id)
  if (gone.length) {
    const { error } = await db().from('invoice_payments').delete().in('id', gone)
    if (error) throw new Error(error.message)
  }
  const today = new Date().toISOString().slice(0, 10)
  for (const p of input.parts) {
    if (!(num(p.amount) > 0)) continue
    const row = {
      label: p.label.trim() || 'Payment',
      due_on: p.due_on || null,
      amount: num(p.amount),
      status: p.status,
      paid_on: p.status === 'paid' ? p.paid_on || p.due_on || today : null,
      payment_mode_id: p.mode || null,
      note: p.note.trim() || null,
    }
    const before = inv.invoice_payments.find((x) => x.id === p.id)
    const fresh = { ...row, tenant_id: tenantId, invoice_id: inv.id, received_by: p.status === 'paid' ? (memberId ?? null) : null }
    if (p.id) {
      const up = await db()
        .from('invoice_payments')
        .update({ ...row, ...(p.status === 'paid' && before?.status !== 'paid' ? { received_by: memberId ?? null } : {}) })
        .eq('id', p.id)
        .select('id')
      if (up.error) throw new Error(up.error.message)
      // a pending part the GST change used up: add it back as entered
      if (up.data?.length) continue
    }
    const { error } = await db().from('invoice_payments').insert(fresh)
    if (error) throw new Error(error.message)
  }
}

export async function addInvoiceOrders(invoiceId: string, orderIds: string[]) {
  const { error } = await db().rpc('invoice_add_orders', { p_invoice: invoiceId, p_orders: orderIds })
  if (error) throw new Error(error.message)
}

export async function removeInvoiceOrder(orderId: string) {
  const { error } = await db().rpc('invoice_remove_order', { p_order: orderId })
  if (error) throw new Error(error.message)
}

/** the invoice's page in the app */
export const invoicePath = (id: string) => `/invoices/${id}`
/** the printable invoice, opened in a new tab */
export const invoicePrintHref = (id: string) => `${import.meta.env.BASE_URL}invoices/${id}/print`

/**
 * Reports that add up booking payments: an order's invoice payments are put on the invoice's first order
 * (orders carry no payments of their own).
 */
export function withInvoicePayments<T extends { id: string; invoice_id: string | null; status: string; created_at: string; booking_payments: unknown[] }>(bookings: T[], invoices: InvoiceRow[]): T[] {
  const first = new Map<string, string>()
  for (const b of [...bookings].sort((x, y) => x.created_at.localeCompare(y.created_at)))
    if (b.invoice_id && b.status !== 'cancelled' && !first.has(b.invoice_id)) first.set(b.invoice_id, b.id)
  const pays = new Map<string, unknown[]>()
  for (const i of invoices) {
    const id = first.get(i.id)
    if (id) pays.set(id, i.invoice_payments.map((p) => ({ ...p, booking_id: id })))
  }
  return bookings.map((b) => (pays.has(b.id) ? { ...b, booking_payments: [...b.booking_payments, ...pays.get(b.id)!] } : b))
}
