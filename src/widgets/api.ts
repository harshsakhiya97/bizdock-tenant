import { db } from '@/lib/supabase'
import { createWorkflow, ensureWorkflowHook } from '@/workflows/api'
import { STEP_DEFAULTS } from '@/workflows/types'

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export const DAYS: { key: DayKey; label: string; short: string }[] = [
  { key: 'mon', label: 'Monday', short: 'Mon' },
  { key: 'tue', label: 'Tuesday', short: 'Tue' },
  { key: 'wed', label: 'Wednesday', short: 'Wed' },
  { key: 'thu', label: 'Thursday', short: 'Thu' },
  { key: 'fri', label: 'Friday', short: 'Fri' },
  { key: 'sat', label: 'Saturday', short: 'Sat' },
  { key: 'sun', label: 'Sunday', short: 'Sun' },
]
export type DayHours = { on: boolean; start: string; end: string }

/** a Booking Calendar widget's settings (widgets.config) */
export type BookingConfig = {
  /** slot length, minutes */
  interval: number
  days: Record<DayKey, DayHours>
  /** team members whose meetings make a slot busy (none: always open) */
  members: string[]
  /** the funnel its leads come from (the workflow looks the visitor's lead up in its sub-business) */
  funnel_id?: string
  color: string
  /** how far ahead people can book (days) */
  days_ahead: number
  /** at least this long from now (hours) */
  notice_hours: number
  webhook: { type: 'workflow'; workflow_id: string } | { type: 'url'; url: string } | { type: 'none' }
  /** shown after booking ({{date}}, {{time}}) */
  thank_you: string
  /** or send them to this page */
  redirect_url: string
}

export type WidgetRow = {
  id: string
  tenant_id: string
  kind: 'booking_calendar'
  name: string
  code: string
  is_active: boolean
  config: BookingConfig
  created_at: string
  updated_at: string
}

export const INTERVALS = [
  [15, '15 minutes'],
  [20, '20 minutes'],
  [30, '30 minutes'],
  [45, '45 minutes'],
  [60, '1 hour'],
  [90, '1.5 hours'],
  [120, '2 hours'],
] as const

export const defaultBookingConfig = (color: string): BookingConfig => ({
  interval: 30,
  days: Object.fromEntries(DAYS.map((d) => [d.key, { on: d.key !== 'sun', start: '10:00', end: d.key === 'sat' ? '14:00' : '19:00' }])) as Record<DayKey, DayHours>,
  members: [],
  color,
  days_ahead: 30,
  notice_hours: 1,
  webhook: { type: 'workflow', workflow_id: '' },
  thank_you: 'Thanks! Your call is booked for {{date}} at {{time}}. You’ll get a confirmation shortly.',
  redirect_url: '',
})

const COLS = 'id, tenant_id, kind, name, code, is_active, config, created_at, updated_at'

export async function listWidgets(tenantId: string): Promise<WidgetRow[]> {
  const { data, error } = await db().from('widgets').select(COLS).eq('tenant_id', tenantId).is('archived_at', null).order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as WidgetRow[]
}

export async function getWidget(id: string): Promise<WidgetRow | null> {
  const { data, error } = await db().from('widgets').select(COLS).eq('id', id).is('archived_at', null).maybeSingle()
  if (error) throw new Error(error.message)
  return data as WidgetRow | null
}

export async function createWidget(tenantId: string, memberId: string | undefined, name: string, config: BookingConfig): Promise<WidgetRow> {
  const { data, error } = await db()
    .from('widgets')
    .insert({ tenant_id: tenantId, kind: 'booking_calendar', name: name.trim(), config, created_by: memberId ?? null })
    .select(COLS)
    .single()
  if (error) throw new Error(error.message)
  return data as WidgetRow
}

export async function updateWidget(id: string, patch: Partial<Pick<WidgetRow, 'name' | 'config' | 'is_active'>>) {
  const { error } = await db().from('widgets').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
}

/** removed from the list (its embed stops working); its bookings are kept */
export async function archiveWidget(id: string) {
  const { error } = await db().from('widgets').update({ archived_at: new Date().toISOString(), is_active: false }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function countBookings(tenantId: string): Promise<Record<string, number>> {
  const { data } = await db().from('widget_bookings').select('widget_id').eq('tenant_id', tenantId).eq('status', 'booked')
  return (data ?? []).reduce<Record<string, number>>((m, r) => ({ ...m, [r.widget_id as string]: (m[r.widget_id as string] ?? 0) + 1 }), {})
}

/** what each booking sends (example values): the builder shows these fields without a test post */
export const BOOKING_FIELDS: Record<string, string> = {
  name: 'Visitor name',
  phone: '9876543210',
  email: 'visitor@example.com',
  meeting_start: '2026-11-04 15:00',
  meeting_end: '2026-11-04 15:30',
  meeting_date: '2026-11-04',
  meeting_time: '15:00',
  meeting_end_time: '15:30',
  member_id: '',
  member_name: 'Team member',
  member_email: 'member@example.com',
  member_phone: '9876543210',
  widget: '',
  booking_id: '',
}

/**
 * The widget's own "On webhook call" workflow: its fields known up front (no test needed) and a first
 * Create Zoom meeting step timed from the booking (and with the booked team member).
 */
export async function createBookingWorkflow(tenantId: string, memberId: string | undefined, name: string, funnelId: string) {
  const id = await createWorkflow(tenantId, memberId, `${name.trim()} – bookings`, 'webhook_call')
  const trigger = { id: 'trigger', type: 'trigger', position: { x: 0, y: 0 }, data: { event: 'webhook_call' } }
  // the visitor's lead (they've filled the lead form before booking): by phone or email, whichever matches
  const lookup = {
    id: `lead_${crypto.randomUUID().slice(0, 8)}`,
    type: 'lead_lookup',
    position: { x: 0, y: 170 },
    data: { match: 'any', phone_var: 'phone', email_var: 'email', value_var: '' },
  }
  // the meeting between that lead and the booked team member, at the booked time
  const zoom = {
    id: `zoom_${crypto.randomUUID().slice(0, 8)}`,
    type: 'zoom_meeting',
    position: { x: 0, y: 340 },
    data: {
      ...STEP_DEFAULTS.zoom_meeting,
      topic: `${name.trim() || 'Call'} – {{name}}`,
      use_webhook: true,
      start_var: 'meeting_start',
      end_var: 'meeting_end',
      meet_mode: 'webhook',
      meet_var: 'member_id',
    },
  }
  const { error } = await db()
    .from('workflows')
    .update({
      funnel_id: funnelId || null,
      nodes: [trigger, lookup, zoom],
      edges: [
        { id: `e_trigger_${lookup.id}`, source: 'trigger', target: lookup.id },
        { id: `e_${lookup.id}_${zoom.id}`, source: lookup.id, target: zoom.id },
      ],
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
  const hook = await ensureWorkflowHook(id)
  await db()
    .from('workflow_hooks')
    .update({ sample: { ...BOOKING_FIELDS, widget: name.trim() }, sample_at: new Date().toISOString(), field_map: {} })
    .eq('id', hook.id)
  return id
}

/** the widget's workflow follows the widget's funnel ("Used in funnel": where Get lead details looks for the lead) */
export async function setWorkflowFunnel(workflowId: string, funnelId: string) {
  const { error } = await db().from('workflows').update({ funnel_id: funnelId || null }).eq('id', workflowId)
  if (error) throw new Error(error.message)
}


/** the iframe to paste on a page */
export const embedCode = (url: string, name: string) =>
  `<iframe src="${url}" title="${name.replace(/"/g, '&quot;')}" style="width:100%;max-width:980px;height:720px;border:0;" loading="lazy"></iframe>`

// ---- public (the embed page, no login) ----
export type PublicWidget = { name: string; kind: string; color: string | null; interval: number | null; days: Record<DayKey, DayHours> | null; days_ahead: number | null; team: number }
export type Slot = { starts_at: string; ends_at: string; free: number; total: number }

export async function publicWidget(code: string): Promise<PublicWidget | null> {
  const { data, error } = await db().rpc('widget_public', { p_code: code })
  if (error) throw new Error(error.message)
  return (data ?? null) as PublicWidget | null
}

export async function widgetSlots(code: string, from: string, to: string): Promise<Slot[]> {
  const { data, error } = await db().rpc('widget_slots', { p_code: code, p_from: from, p_to: to })
  if (error) throw new Error(error.message)
  return (data ?? []) as Slot[]
}

export async function bookSlot(code: string, start: string, who: { name: string; phone: string; email: string }) {
  const { data, error } = await db().functions.invoke('widget-book', { body: { code, start, ...who } })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const payload = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null
    throw new Error(payload?.error ?? error.message)
  }
  if (data?.error) throw new Error(data.error)
  return data as { ok: true; booking_id: string; thank_you: string; redirect_url: string | null }
}
