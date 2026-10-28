import { db } from '@/lib/supabase'

export type EventKind = 'event' | 'webinar' | 'holiday' | 'leave'
export type EventType = { id: string; name: string; kind: EventKind; color: string; is_active: boolean; sort_order: number }
export type Option = { id: string; name: string; is_active: boolean }

export type EventRow = {
  id: string
  tenant_id: string
  business_id: string | null
  type_id: string
  title: string
  topic: string | null
  event_date: string
  end_date: string | null
  start_time: string | null
  end_time: string | null
  webinar_type_id: string | null
  location: string | null
  meeting_link: string | null
  zoom_webinar_id: string | null
  /** Zoom: the account it is created on (meeting or webinar), and what Zoom gave back */
  zoom_account_id: string | null
  zoom_kind: 'meeting' | 'webinar'
  zoom_start_url: string | null
  zoom_password: string | null
  zoom_error: string | null
  zoom_pulled_at: string | null
  description: string | null
  series_id: string | null
  is_cancelled: boolean
  event_members: { member_id: string }[]
}

export type EventInput = {
  business_id: string
  type_id: string
  title: string
  topic: string
  event_date: string
  end_date: string
  start_time: string
  end_time: string
  webinar_type_id: string
  location: string
  meeting_link: string
  zoom_webinar_id: string
  /** '' = no Zoom (type the link / ID) */
  zoom_account_id: string
  zoom_kind: 'meeting' | 'webinar'
  description: string
  members: string[]
  recurring: boolean
  repeat: 'daily' | 'weekly' | 'monthly'
  until: string
}

export async function listEvents(tenantId: string): Promise<EventRow[]> {
  const { data, error } = await db()
    .from('events')
    .select('*, event_members(member_id)')
    .eq('tenant_id', tenantId)
    .eq('is_cancelled', false)
    .order('event_date')
    .order('start_time', { nullsFirst: true })
  if (error) throw error
  return (data ?? []) as EventRow[]
}

export async function listEventTypes(tenantId: string): Promise<EventType[]> {
  const { data, error } = await db().from('event_types').select('id, name, kind, color, is_active, sort_order').eq('tenant_id', tenantId).order('sort_order')
  if (error) throw error
  return (data ?? []) as EventType[]
}

export async function listWebinarTypes(tenantId: string): Promise<Option[]> {
  const { data } = await db().from('webinar_types').select('id, name, is_active').eq('tenant_id', tenantId).order('sort_order')
  return (data ?? []) as Option[]
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dayDiff = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 864e5)

/** Dates of a recurring event from its first date up to `until` (at most 104). */
export function seriesDates(first: string, repeat: EventInput['repeat'], until: string) {
  const out: string[] = []
  const start = new Date(`${first}T00:00:00`)
  for (let i = 0; out.length < 104; i++) {
    const d = new Date(start)
    if (repeat === 'daily') d.setDate(d.getDate() + i)
    else if (repeat === 'weekly') d.setDate(d.getDate() + 7 * i)
    else {
      d.setMonth(d.getMonth() + i)
      if (d.getDate() !== start.getDate()) continue // e.g. no 31st this month
    }
    const s = iso(d)
    if (s > until) break
    out.push(s)
  }
  return out
}

function toRow(tenantId: string, input: EventInput) {
  const clean = (s: string) => s.trim() || null
  return {
    tenant_id: tenantId,
    business_id: input.business_id || null,
    type_id: input.type_id,
    title: input.title.trim(),
    topic: clean(input.topic),
    event_date: input.event_date,
    end_date: input.end_date && input.end_date > input.event_date ? input.end_date : null,
    start_time: input.start_time || null,
    end_time: input.end_time || null,
    webinar_type_id: input.webinar_type_id || null,
    location: clean(input.location),
    // on Zoom: the link and the ID come from Zoom (each event of a series has its own)
    ...(input.zoom_account_id && input.start_time
      ? { zoom_account_id: input.zoom_account_id, zoom_kind: input.zoom_kind }
      : { zoom_account_id: null, meeting_link: clean(input.meeting_link), zoom_webinar_id: clean(input.zoom_webinar_id) }),
    description: clean(input.description),
  }
}

async function setMembers(tenantId: string, eventIds: string[], members: string[]) {
  if (!eventIds.length) return
  const { error: delErr } = await db().from('event_members').delete().in('event_id', eventIds)
  if (delErr) throw delErr
  if (!members.length) return
  const { error } = await db()
    .from('event_members')
    .insert(eventIds.flatMap((event_id) => members.map((member_id) => ({ event_id, member_id, tenant_id: tenantId }))))
  if (error) throw error
}

/** New event (or a recurring series of them). Returns how many were created. */
export async function createEvent(tenantId: string, memberId: string | undefined, input: EventInput) {
  const base = toRow(tenantId, input)
  const dates = input.recurring && input.until ? seriesDates(input.event_date, input.repeat, input.until) : [input.event_date]
  const span = base.end_date ? dayDiff(base.event_date, base.end_date) : 0
  const series = dates.length > 1 ? crypto.randomUUID() : null
  const rows = dates.map((d) => {
    const end = new Date(`${d}T00:00:00`)
    end.setDate(end.getDate() + span)
    return { ...base, id: crypto.randomUUID(), event_date: d, end_date: span ? iso(end) : null, series_id: series, created_by: memberId ?? null }
  })
  const { error } = await db().from('events').insert(rows)
  if (error) throw error
  await setMembers(tenantId, rows.map((r) => r.id), input.members)
  return rows.length
}

/** Edit one event, or it and the rest of its series from its date on (dates of the others stay). */
export async function updateEvent(tenantId: string, ev: EventRow, input: EventInput, scope: 'one' | 'series') {
  const row = toRow(tenantId, input)
  if (scope === 'series' && ev.series_id) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { event_date, end_date, ...shared } = row
    const { data, error } = await db()
      .from('events')
      .update(shared)
      .eq('series_id', ev.series_id)
      .gte('event_date', ev.event_date)
      .eq('is_cancelled', false)
      .select('id')
    if (error) throw error
    await db().from('events').update({ event_date, end_date }).eq('id', ev.id)
    await setMembers(tenantId, (data ?? []).map((r) => r.id as string), input.members)
    return (data ?? []).length
  }
  const { error } = await db().from('events').update(row).eq('id', ev.id)
  if (error) throw error
  await setMembers(tenantId, [ev.id], input.members)
  return 1
}

export async function cancelEvent(ev: EventRow, scope: 'one' | 'series') {
  const q =
    scope === 'series' && ev.series_id
      ? db().from('events').update({ is_cancelled: true }).eq('series_id', ev.series_id).gte('event_date', ev.event_date)
      : db().from('events').update({ is_cancelled: true }).eq('id', ev.id)
  const { error } = await q
  if (error) throw error
}

/** "7:00 pm – 8:30 pm", "All day" */
export function timeText(e: { start_time: string | null; end_time: string | null }) {
  const f = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    const d = new Date()
    d.setHours(h, m, 0, 0)
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  }
  if (!e.start_time) return 'All day'
  return e.end_time ? `${f(e.start_time)} – ${f(e.end_time)}` : f(e.start_time)
}

export { iso as isoDate }
