import { db } from '@/lib/supabase'
import type { BookingInput, BookingRow, LeadMessage, MessageTemplate } from './types'

const COLS = '*, booking_payments(*), booking_items(*)'

export async function listBookings(
  tenantId: string,
  f: { leadId?: string; customerId?: string; from?: string; to?: string } = {},
): Promise<BookingRow[]> {
  let q = db().from('bookings').select(COLS).eq('tenant_id', tenantId)
  if (f.leadId && f.customerId) q = q.or(`lead_id.eq.${f.leadId},customer_id.eq.${f.customerId}`)
  else if (f.leadId) q = q.eq('lead_id', f.leadId)
  else if (f.customerId) q = q.eq('customer_id', f.customerId)
  if (f.from) q = q.gte('booking_date', f.from)
  if (f.to) q = q.lte('booking_date', f.to)
  const { data, error } = await q.order('booking_date', { ascending: false }).order('start_time')
  if (error) throw error
  return (data ?? []) as BookingRow[]
}

export async function getBooking(id: string): Promise<BookingRow | null> {
  const { data, error } = await db().from('bookings').select(COLS).eq('id', id).maybeSingle()
  if (error) throw error
  return (data as BookingRow | null) ?? null
}

const money = (v: string) => (v.trim() ? Math.max(0, Number(v)) : 0)

/**
 * Saves a booking. A new enquiry entered with it is added as a lead first (first funnel of the business,
 * first stage) so the client has follow-ups. An advance on a new booking is recorded as its first payment.
 */
export async function saveBooking(
  tenantId: string,
  memberId: string | undefined,
  existing: BookingRow | null,
  input: BookingInput,
  firstFunnel: { id: string; stage_id: string } | null,
) {
  let leadId = input.lead_id
  if (!existing && !leadId && input.new_lead) {
    const n = input.new_lead
    const first = n.name.trim().split(/\s+/)[0]
    const last = n.name.trim().slice(first.length).trim() || null
    leadId = crypto.randomUUID()
    const { error } = await db()
      .from('leads')
      .insert({
        id: leadId,
        tenant_id: tenantId,
        business_id: input.business_id,
        sub_business_id: input.sub_business_id || null,
        funnel_id: firstFunnel?.id ?? null,
        stage_id: firstFunnel?.stage_id ?? null,
        first_name: first,
        last_name: last,
        phone: n.phone.trim(),
        purpose: n.purpose.trim() || null,
        required_on: input.booking_date,
        source_id: n.source_id || null,
        owner_id: memberId ?? null,
        created_by: memberId ?? null,
      })
    if (error) throw new Error(error.message)
    await db().from('lead_activities').insert({ tenant_id: tenantId, lead_id: leadId, kind: 'created', to_stage_id: firstFunnel?.stage_id ?? null, note: 'Added with a booking', member_id: memberId })
  }
  const row = {
    business_id: input.business_id,
    sub_business_id: input.sub_business_id || null,
    product_id: input.product_id || null,
    lead_id: leadId,
    ...(input.customer_id ? { customer_id: input.customer_id } : {}),
    client_name: input.client_name.trim(),
    phone: input.phone.trim() || null,
    purpose: input.purpose.trim() || null,
    booking_date: input.booking_date,
    start_time: input.start_time,
    end_time: input.end_time,
    amount: money(input.amount),
    gst_applicable: input.gst_applicable,
    gst_rate: input.gst_applicable ? Number(input.gst_rate) || 18 : 18,
    status: input.status,
    billing_company_id: input.billing_company_id || null,
    notes: input.notes.trim() || null,
  }
  let id = existing?.id
  if (existing) {
    const { error } = await db().from('bookings').update(row).eq('id', existing.id)
    if (error) throw new Error(error.message)
  } else {
    id = crypto.randomUUID()
    const { error } = await db()
      .from('bookings')
      .insert({ ...row, id, tenant_id: tenantId, owner_id: memberId ?? null, created_by: memberId ?? null })
    if (error) throw new Error(error.message)
  }
  await saveItems(tenantId, id!, input.items)
  await saveParts(tenantId, memberId, id!, existing?.booking_payments ?? [], input.parts)
  return id!
}

/** replaces the booking's services */
async function saveItems(tenantId: string, bookingId: string, items: BookingInput['items']) {
  const del = await db().from('booking_items').delete().eq('booking_id', bookingId)
  if (del.error) throw new Error(del.error.message)
  const rows = items
    .filter((i) => i.name.trim())
    .map((i, n) => ({ tenant_id: tenantId, booking_id: bookingId, product_id: i.product_id || null, name: i.name.trim(), price: money(i.price), sort_order: n }))
  if (rows.length) {
    const { error } = await db().from('booking_items').insert(rows)
    if (error) throw new Error(error.message)
  }
}

/** saves the payment plan: updates kept parts, adds new ones, removes deleted ones */
async function saveParts(tenantId: string, memberId: string | undefined, bookingId: string, before: BookingRow['booking_payments'], parts: BookingInput['parts']) {
  const keep = new Set(parts.map((p) => p.id).filter(Boolean))
  const gone = before.filter((p) => !keep.has(p.id)).map((p) => p.id)
  if (gone.length) {
    const { error } = await db().from('booking_payments').delete().in('id', gone)
    if (error) throw new Error(error.message)
  }
  const today = new Date().toISOString().slice(0, 10)
  for (const p of parts) {
    if (!(money(p.amount) > 0)) continue
    const row = {
      label: p.label.trim() || 'Payment',
      due_on: p.due_on || null,
      amount: money(p.amount),
      status: p.status,
      paid_on: p.status === 'paid' ? p.paid_on || p.due_on || today : null,
      payment_mode_id: p.mode || null,
      note: p.note.trim() || null,
    }
    const { error } = p.id
      ? await db().from('booking_payments').update(row).eq('id', p.id)
      : await db().from('booking_payments').insert({ ...row, tenant_id: tenantId, booking_id: bookingId, received_by: p.status === 'paid' ? (memberId ?? null) : null })
    if (error) throw new Error(error.message)
  }
}

export async function addBookingPayment(
  tenantId: string,
  memberId: string | undefined,
  bookingId: string,
  p: { amount: string; mode: string; reference: string; paid_on: string },
) {
  const { error } = await db()
    .from('booking_payments')
    .insert({
      tenant_id: tenantId,
      booking_id: bookingId,
      amount: money(p.amount),
      paid_on: p.paid_on || new Date().toISOString().slice(0, 10),
      payment_mode_id: p.mode || null,
      reference: p.reference.trim() || null,
      received_by: memberId ?? null,
    })
  if (error) throw new Error(error.message)
}

export async function deleteBookingPayment(id: string) {
  const { error } = await db().from('booking_payments').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function createBookingInvoice(bookingId: string, companyId: string | null) {
  const { data, error } = await db().rpc('booking_invoice', { p_booking: bookingId, p_company: companyId })
  if (error) throw new Error(error.message)
  return data as string
}

// ---------- WhatsApp ----------
export async function listTemplates(tenantId: string): Promise<MessageTemplate[]> {
  const { data, error } = await db()
    .from('message_templates')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('channel', 'whatsapp')
    .order('category')
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as MessageTemplate[]
}

export async function saveTemplate(tenantId: string, t: Partial<MessageTemplate> & { title: string; body: string; category: string }) {
  const row = { title: t.title.trim(), body: t.body.trim(), category: t.category, is_active: t.is_active ?? true, sort_order: t.sort_order ?? 0 }
  const { error } = t.id
    ? await db().from('message_templates').update(row).eq('id', t.id)
    : await db().from('message_templates').insert({ ...row, tenant_id: tenantId, channel: 'whatsapp' })
  if (error) throw new Error(error.message)
}

export async function deleteTemplate(id: string) {
  const { error } = await db().from('message_templates').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function listLeadMessages(leadId: string): Promise<LeadMessage[]> {
  const { data, error } = await db().from('lead_messages').select('*').eq('lead_id', leadId).order('sent_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as LeadMessage[]
}

/** opens WhatsApp with the text and keeps a copy on the lead */
export async function sendWhatsApp(
  tenantId: string,
  memberId: string | undefined,
  lead: { id: string; phone: string; whatsapp?: string | null },
  msg: { template_id: string | null; title: string | null; body: string },
) {
  const digits = (lead.whatsapp || lead.phone).replace(/\D/g, '')
  const to = digits.length === 10 ? `91${digits}` : digits
  // api.whatsapp.com keeps emojis (wa.me's redirect turns them into ◆ in the WhatsApp app)
  window.open(`https://api.whatsapp.com/send?phone=${to}&text=${encodeURIComponent(msg.body)}`, '_blank', 'noopener')
  const { error } = await db()
    .from('lead_messages')
    .insert({ tenant_id: tenantId, lead_id: lead.id, template_id: msg.template_id, title: msg.title, body: msg.body, sent_by: memberId ?? null })
  if (error) throw new Error(error.message)
}

/** {{first_name}}, {{purpose}} … filled in from the lead / booking */
export function fillTemplate(body: string, v: Record<string, string | null | undefined>) {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => (v[k] ?? '').toString() || `{{${k}}}`)
}

/** a booking in the shared studio (Studio Rental or Paid Podcast) — slot only, no amounts */
export type BusySlot = {
  id: string
  sub_business_id: string
  sub_name: string
  client_name: string
  purpose: string | null
  booking_date: string
  start_time: string
  end_time: string
  status: string
}

/** studio bookings of a business, across its Studio Rental and Paid Podcast sub-businesses */
export async function studioBusy(businessId: string): Promise<BusySlot[]> {
  const { data, error } = await db().rpc('studio_busy', { p_business: businessId })
  if (error) throw error
  return (data ?? []) as BusySlot[]
}

/** the first studio booking that overlaps this slot (another booking, not cancelled) */
export function studioClash(busy: BusySlot[], slot: { id?: string; date: string; start: string; end: string }) {
  const m = (t: string) => {
    const [h, mm] = t.split(':').map(Number)
    return h * 60 + mm
  }
  return busy.find((b) => b.id !== slot.id && b.booking_date === slot.date && m(b.start_time) < m(slot.end) && m(b.end_time) > m(slot.start)) ?? null
}
