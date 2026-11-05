import { db } from '@/lib/supabase'

// ---------------- Masters → Webinar hosts ----------------
export type WebinarHost = { id: string; name: string; email: string | null; phone: string | null; is_active: boolean; sort_order: number }

export async function listHosts(tenantId: string): Promise<WebinarHost[]> {
  const { data, error } = await db().from('webinar_hosts').select('id, name, email, phone, is_active, sort_order').eq('tenant_id', tenantId).order('sort_order').order('name')
  if (error) throw error
  return (data ?? []) as WebinarHost[]
}

export async function saveHost(tenantId: string, id: string | null, h: { name: string; email: string; phone: string; is_active: boolean; sort_order?: number }) {
  const row = { name: h.name.trim(), email: h.email.trim() || null, phone: h.phone.trim() || null, is_active: h.is_active, ...(h.sort_order != null ? { sort_order: h.sort_order } : {}) }
  const { data, error } = id
    ? await db().from('webinar_hosts').update(row).eq('id', id).select('id').single()
    : await db().from('webinar_hosts').insert({ ...row, tenant_id: tenantId }).select('id').single()
  if (error) throw error
  return String(data.id)
}

export async function deleteHost(id: string) {
  const { error } = await db().from('webinar_hosts').delete().eq('id', id)
  if (error) throw error
}

// ---------------- webinars ----------------
export type WebinarRepeat = 'once' | 'dates' | 'weekly'
export type WebinarRow = {
  id: string
  tenant_id: string
  business_id: string
  title: string
  description: string | null
  host_id: string | null
  zoom_account_id: string | null
  funnel_id: string | null
  repeat: WebinarRepeat
  first_date: string
  dates: string[]
  weekdays: number[]
  stop_date: string | null
  start_time: string
  end_time: string
  is_active: boolean
  created_at: string
}
export type WebinarInput = Omit<WebinarRow, 'id' | 'tenant_id' | 'created_at'>

/** one date of a webinar (a calendar event with its own Zoom webinar) */
export type WebinarDate = {
  id: string
  webinar_id: string
  title: string
  event_date: string
  start_time: string
  end_time: string | null
  meeting_link: string | null
  zoom_webinar_id: string | null
  zoom_start_url: string | null
  zoom_password: string | null
  zoom_error: string | null
  zoom_pulled_at: string | null
  is_cancelled: boolean
}

export async function listWebinars(tenantId: string): Promise<WebinarRow[]> {
  const { data, error } = await db().from('webinars').select('*').eq('tenant_id', tenantId).is('archived_at', null).order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as WebinarRow[]).map((w) => ({ ...w, start_time: w.start_time.slice(0, 5), end_time: w.end_time.slice(0, 5) }))
}

export async function listWebinarDates(tenantId: string): Promise<WebinarDate[]> {
  const { data, error } = await db()
    .from('events')
    .select('id, webinar_id, title, event_date, start_time, end_time, meeting_link, zoom_webinar_id, zoom_start_url, zoom_password, zoom_error, zoom_pulled_at, is_cancelled')
    .eq('tenant_id', tenantId)
    .not('webinar_id', 'is', null)
    .eq('is_cancelled', false)
    .order('event_date')
  if (error) throw error
  return (data ?? []) as WebinarDate[]
}

/** saves the webinar; its next date (and Zoom webinar) is made / kept in line by the database */
export async function saveWebinar(tenantId: string, memberId: string | undefined, id: string | null, input: WebinarInput) {
  const row = {
    ...input,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    dates: input.repeat === 'dates' ? [...new Set(input.dates)].sort() : [],
    weekdays: input.repeat === 'weekly' ? [...new Set(input.weekdays)].sort() : [],
    stop_date: input.repeat === 'weekly' ? input.stop_date || null : null,
    first_date: input.repeat === 'dates' ? ([...input.dates].sort()[0] ?? input.first_date) : input.first_date,
  }
  if (id) {
    const { error } = await db().from('webinars').update(row).eq('id', id)
    if (error) throw error
    return id
  }
  const { data, error } = await db()
    .from('webinars')
    .insert({ ...row, tenant_id: tenantId, created_by: memberId ?? null })
    .select('id')
    .single()
  if (error) throw error
  return String(data.id)
}

/** "Delete" in the app: archived; its coming dates are called off (and removed from Zoom) */
export async function archiveWebinar(id: string) {
  const { error } = await db().from('webinars').update({ archived_at: new Date().toISOString(), is_active: false }).eq('id', id)
  if (error) throw error
}

// ---------------- registrations & Zoom data ----------------
export type Category = 'super_hot' | 'hot' | 'warm' | 'cold'
export const CATEGORY_META: Record<Category, { label: string; color: string }> = {
  super_hot: { label: 'Super Hot', color: '#dc2626' },
  hot: { label: 'Hot', color: '#ea580c' },
  warm: { label: 'Warm', color: '#d97706' },
  cold: { label: 'Cold', color: '#64748b' },
}

export type Registration = {
  id: string
  webinar_id: string
  event_id: string
  lead_id: string
  join_url: string | null
  short_link: string | null
  category: Category | null
  attended_minutes: number | null
  categorized_at: string | null
  created_at: string
  leads?: { first_name: string; last_name: string | null; phone: string; email: string | null } | null
  events?: { title: string; event_date: string; start_time: string; end_time: string | null } | null
}

export async function listRegistrations(filter: { eventId?: string; leadId?: string }): Promise<Registration[]> {
  let q = db()
    .from('webinar_registrations')
    .select('id, webinar_id, event_id, lead_id, join_url, short_link, category, attended_minutes, categorized_at, created_at, leads(first_name, last_name, phone, email), events(title, event_date, start_time, end_time)')
  if (filter.eventId) q = q.eq('event_id', filter.eventId)
  if (filter.leadId) q = q.eq('lead_id', filter.leadId)
  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as Registration[]
}

export type Attendance = { event_id: string; lead_id: string | null; name: string | null; email: string | null; join_time: string | null; leave_time: string | null; minutes: number | null; sessions: number | null }
export type ZoomComment = { event_id: string; lead_id: string | null; kind: 'qa' | 'chat' | 'poll'; name: string | null; email: string | null; body: string; answer: string | null; said_at: string | null }

export async function listZoomData(filter: { eventId?: string; leadId?: string }) {
  const att = db().from('zoom_attendance').select('event_id, lead_id, name, email, join_time, leave_time, minutes, sessions').not('event_id', 'is', null)
  const com = db().from('zoom_comments').select('event_id, lead_id, kind, name, email, body, answer, said_at').not('event_id', 'is', null)
  const [a, c] = await Promise.all([
    filter.eventId ? att.eq('event_id', filter.eventId) : att.eq('lead_id', filter.leadId ?? ''),
    filter.eventId ? com.eq('event_id', filter.eventId) : com.eq('lead_id', filter.leadId ?? ''),
  ])
  return { attendance: (a.data ?? []) as Attendance[], comments: ((c.data ?? []) as ZoomComment[]).sort((x, y) => (x.said_at ?? '').localeCompare(y.said_at ?? '')) }
}

/** fetch the date's attendance / Q&A / chat / polls from Zoom now */
export async function pullZoom(eventId: string) {
  const { data, error } = await db().functions.invoke('zoom', { body: { action: 'pull', kind: 'event', id: eventId } })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const body = ctx ? await ctx.json().catch(() => null) : null
    throw new Error(body?.error ?? error.message)
  }
  return data as { attendees: number; questions: number; polls?: number; chat: number; notes?: string[] }
}

// ---------------- purchases ----------------
export type PurchasePayment = {
  id: string
  purchase_id: string
  label: string | null
  amount: number
  due_on: string | null
  paid_on: string | null
  status: 'pending' | 'paid'
  payment_mode_id: string | null
  note: string | null
}
export type Purchase = {
  id: string
  business_id: string
  lead_id: string
  product_id: string | null
  name: string
  price: number
  gst_applicable: boolean
  gst_rate: number
  gst_amount: number
  total_amount: number
  paid_amount: number
  purchase_date: string
  notes: string | null
  status: 'active' | 'cancelled'
  created_at: string
  purchase_payments: PurchasePayment[]
}

export async function listPurchases(filter: { leadId?: string; tenantId?: string }): Promise<Purchase[]> {
  let q = db().from('purchases').select('*, purchase_payments(*)')
  if (filter.leadId) q = q.eq('lead_id', filter.leadId)
  if (filter.tenantId) q = q.eq('tenant_id', filter.tenantId)
  const { data, error } = await q.order('purchase_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as Purchase[]
}

export type PartDraft = { key: string; id?: string; label: string; due_on: string; amount: string; mode: string; note: string; status: 'pending' | 'paid'; paid_on: string }
export type PurchaseInput = {
  business_id: string
  lead_id: string
  product_id: string
  name: string
  price: number
  gst_applicable: boolean
  gst_rate: number
  purchase_date: string
  notes: string
  parts: PartDraft[]
}

export async function savePurchase(tenantId: string, memberId: string | undefined, existing: Purchase | null, p: PurchaseInput) {
  const gst = p.gst_applicable ? Math.round(p.price * p.gst_rate) / 100 : 0
  const row = {
    business_id: p.business_id,
    lead_id: p.lead_id,
    product_id: p.product_id || null,
    name: p.name.trim(),
    price: p.price,
    gst_applicable: p.gst_applicable,
    gst_rate: p.gst_rate,
    gst_amount: gst,
    total_amount: p.price + gst,
    purchase_date: p.purchase_date,
    notes: p.notes.trim() || null,
  }
  let id = existing?.id
  if (existing) {
    const { error } = await db().from('purchases').update(row).eq('id', existing.id)
    if (error) throw error
  } else {
    const { data, error } = await db().from('purchases').insert({ ...row, tenant_id: tenantId, created_by: memberId ?? null }).select('id').single()
    if (error) throw error
    id = String(data.id)
  }
  // payment parts: removed, changed, added
  const keep = new Set(p.parts.filter((x) => x.id).map((x) => x.id))
  const gone = (existing?.purchase_payments ?? []).filter((x) => !keep.has(x.id)).map((x) => x.id)
  if (gone.length) {
    const { error } = await db().from('purchase_payments').delete().in('id', gone)
    if (error) throw error
  }
  for (const x of p.parts) {
    const values = {
      label: x.label.trim() || 'Payment',
      amount: Number(x.amount) || 0,
      due_on: x.due_on || null,
      status: x.status,
      paid_on: x.status === 'paid' ? x.paid_on || new Date().toISOString().slice(0, 10) : null,
      payment_mode_id: x.status === 'paid' ? x.mode || null : null,
      note: x.note.trim() || null,
      received_by: x.status === 'paid' ? (memberId ?? null) : null,
    }
    const { error } = x.id
      ? await db().from('purchase_payments').update(values).eq('id', x.id)
      : await db().from('purchase_payments').insert({ ...values, tenant_id: tenantId, purchase_id: id })
    if (error) throw error
  }
  return id!
}

export async function deletePurchase(id: string) {
  const { error } = await db().from('purchases').delete().eq('id', id)
  if (error) throw error
}

/** leads with a paid part of a purchase (customers), and what they bought / paid */
export async function purchaseTotals(tenantId: string): Promise<Map<string, { count: number; billed: number; paid: number; last: string }>> {
  const { data, error } = await db().from('purchases').select('lead_id, total_amount, paid_amount, purchase_date').eq('tenant_id', tenantId).eq('status', 'active').gt('paid_amount', 0)
  if (error) throw error
  const m = new Map<string, { count: number; billed: number; paid: number; last: string }>()
  for (const p of (data ?? []) as { lead_id: string; total_amount: number; paid_amount: number; purchase_date: string }[]) {
    const r = m.get(p.lead_id) ?? { count: 0, billed: 0, paid: 0, last: '' }
    r.count += 1
    r.billed += Number(p.total_amount)
    r.paid += Number(p.paid_amount)
    if (p.purchase_date > r.last) r.last = p.purchase_date
    m.set(p.lead_id, r)
  }
  return m
}

/** "Sun, Wed" */
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export function repeatText(w: Pick<WebinarRow, 'repeat' | 'dates' | 'weekdays' | 'stop_date' | 'first_date'>) {
  const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  if (w.repeat === 'once') return `Once · ${day(w.first_date)}`
  if (w.repeat === 'dates') return `${w.dates.length} date${w.dates.length === 1 ? '' : 's'}: ${w.dates.map(day).join(', ')}`
  const days = [...w.weekdays].sort().map((d) => WEEKDAYS[d]).join(', ')
  return `Every ${days || '—'} from ${day(w.first_date)}${w.stop_date ? ` until ${day(w.stop_date)}` : ' · never stops'}`
}
