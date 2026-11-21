import { rpcAll } from '@/lib/fetchAll'
import { db } from '@/lib/supabase'
import type { ActivityRow, LeadInput, LeadRow, MemberOption, Option, Temperature } from './types'

const COLS =
  'id, tenant_id, business_id, sub_business_id, funnel_id, stage_id, first_name, last_name, phone, whatsapp, email, city, source_id, referred_by, temperature, estimated_amount, owner_id, tags, notes, next_follow_up_at, lost_reason_id, is_archived, archive_reason, stage_changed_at, created_at, updated_at, landing_page_id, webhook_id, sheet_id, utm_source, utm_medium, utm_campaign, utm_term, utm_content, extra, purpose, required_on, required_hours, webinar_category'

/** every field of a lead that can be empty, as null (list_leads_lite leaves empty fields out) */
const LEAD_NULLS = Object.fromEntries(
  COLS.split(',')
    .map((c) => c.trim())
    .filter((c) => !['id', 'tenant_id', 'business_id', 'first_name', 'phone', 'tags', 'is_archived', 'stage_changed_at', 'created_at', 'updated_at', 'extra'].includes(c))
    .map((c) => [c, null]),
)

// the last full list per workspace, reused for a minute when a page opens with `cached` (moving between Leads,
// Customers, Follow-ups…); any change to leads or follow-ups made through the app's api files clears it, and a
// page reloading after its own change always gets a fresh one
const CACHE_MS = 60_000
const cached = new Map<string, { at: number; rows: LeadRow[] }>()
export const clearLeadsCache = () => cached.clear()

// a load already running for the workspace is shared (two pages asking at once, or React running an effect twice)
const loading = new Map<string, { promise: Promise<LeadRow[]>; partial: Set<(rows: LeadRow[]) => void> }>()

/**
 * Every lead of the workspace, newest first. `onPartial` gets the newest ones as they arrive (the first 3,000 in well
 * under a second), so a list can show them while the rest load.
 */
export function listLeads(tenantId: string, onPartial?: (rows: LeadRow[]) => void, opts?: { cached?: boolean }): Promise<LeadRow[]> {
  // opened again within a minute (another page, or back to this one): the list just loaded, unless something changed
  const hit = cached.get(tenantId)
  if (opts?.cached && hit && Date.now() - hit.at < CACHE_MS) return Promise.resolve(hit.rows)
  const running = loading.get(tenantId)
  if (running) {
    if (onPartial) running.partial.add(onPartial)
    return running.promise
  }
  const partial = new Set<(rows: LeadRow[]) => void>(onPartial ? [onPartial] : [])
  const promise = loadLeads(tenantId, (rows) => partial.forEach((f) => f(rows)))
    .then((rows) => {
      cached.set(tenantId, { at: Date.now(), rows })
      return rows
    })
    .finally(() => loading.delete(tenantId))
  loading.set(tenantId, { promise, partial })
  return promise
}

async function loadLeads(tenantId: string, onPartial: (rows: LeadRow[]) => void): Promise<LeadRow[]> {
  // all of them, past the 1,000-rows-per-request cap (a workspace can hold tens of thousands)
  // list_leads_lite: the same access rule as the table, checked once per call (fast with 20,000+ leads); a lighter row
  // (only the extra fields the lists read, empty fields left out and filled back in here as null)
  const fill = (rows: Partial<LeadRow>[]) => rows.map((r) => ({ ...LEAD_NULLS, ...r }) as LeadRow)
  const rows = await rpcAll<Partial<LeadRow>>((offset, limit) => db().rpc('list_leads_lite', { p_tenant: tenantId, p_offset: offset, p_limit: limit }), 1000, 3, (soFar) => onPartial(fill(soFar)))
  return fill(rows)
}

export async function listFunnelLeads(funnelId: string): Promise<LeadRow[]> {
  const { data, error } = await db()
    .from('leads')
    .select(COLS)
    .eq('funnel_id', funnelId)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as LeadRow[]
}

/** CSV rows → leads in a funnel, or in a business without a funnel (same phone = update). */
export async function importLeads(
  target: { businessId: string; funnelId: string | null },
  pageId: string | null,
  fromFunnel: boolean,
  rows: Record<string, string>[],
) {
  clearLeadsCache()
  const { data, error } = await db().rpc('import_leads', {
    p_business: target.businessId,
    p_funnel: target.funnelId,
    p_page: pageId,
    p_from_funnel: fromFunnel,
    p_rows: rows,
  })
  if (error) throw new Error(error.message)
  return data as { created: number; updated: number; skipped: number; errors: { row: number; error: string }[] }
}

export async function listSources(tenantId: string): Promise<Option[]> {
  const { data } = await db().from('lead_sources').select('id, name').eq('tenant_id', tenantId).eq('is_active', true).order('sort_order')
  return (data ?? []) as Option[]
}

export async function listLostReasons(tenantId: string): Promise<Option[]> {
  const { data } = await db().from('lost_reasons').select('id, name').eq('tenant_id', tenantId).eq('is_active', true).order('sort_order')
  return (data ?? []) as Option[]
}

export async function listMemberOptions(tenantId: string): Promise<MemberOption[]> {
  const { data } = await db().rpc('member_directory', { p_tenant: tenantId })
  return (data ?? []) as MemberOption[]
}

export async function phoneExists(businessId: string, phone: string, except?: string) {
  const { data } = await db().rpc('lead_phone_exists', { p_business: businessId, p_phone: phone, p_except: except ?? null })
  return Boolean(data)
}

export async function listActivities(leadId: string): Promise<ActivityRow[]> {
  const { data, error } = await db()
    .from('lead_activities')
    .select('id, kind, from_stage_id, to_stage_id, note, member_id, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ActivityRow[]
}

type Activity = Omit<ActivityRow, 'id' | 'created_at' | 'member_id'>

export async function logActivity(tenantId: string, memberId: string | undefined, leadIds: string[], a: Partial<Activity> & { kind: Activity['kind'] }) {
  if (!memberId || !leadIds.length) return
  await db()
    .from('lead_activities')
    .insert(leadIds.map((lead_id) => ({ tenant_id: tenantId, lead_id, member_id: memberId, ...a })))
}

const clean = (v: string) => (v.trim() ? v.trim() : null)

function toRow(input: LeadInput) {
  return {
    funnel_id: input.funnel_id || null,
    stage_id: input.funnel_id ? input.stage_id || null : null,
    first_name: input.first_name.trim(),
    last_name: clean(input.last_name),
    phone: input.phone.trim(),
    whatsapp: clean(input.whatsapp),
    email: clean(input.email),
    city: clean(input.city),
    source_id: input.source_id || null,
    referred_by: clean(input.referred_by),
    temperature: (input.temperature || null) as Temperature | null,
    estimated_amount: input.estimated_amount.trim() ? Number(input.estimated_amount) : null,
    owner_id: input.owner_id || null,
    tags: input.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    notes: clean(input.notes),
    purpose: clean(input.purpose),
    required_on: input.required_on || null,
    required_hours: input.required_hours.trim() ? Number(input.required_hours) : null,
    sub_business_id: input.sub_business_id || null,
  }
}

export async function getLead(id: string): Promise<LeadRow | null> {
  const { data, error } = await db().from('leads').select(COLS).eq('id', id).maybeSingle()
  if (error) throw error
  return (data as LeadRow | null) ?? null
}

export async function createLead(tenantId: string, businessId: string, memberId: string | undefined, input: LeadInput) {
  clearLeadsCache()
  const { data, error } = await db()
    .from('leads')
    .insert({ ...toRow(input), tenant_id: tenantId, business_id: businessId, created_by: memberId ?? null })
    .select('id')
    .single()
  if (error) throw error
  await logActivity(tenantId, memberId, [data.id], { kind: 'created', to_stage_id: input.stage_id })
  return data.id as string
}

export async function updateLead(
  tenantId: string,
  memberId: string | undefined,
  lead: LeadRow,
  input: LeadInput,
  stageNote: { note: string; lost_reason_id: string | null },
) {
  clearLeadsCache()
  const row = toRow(input)
  const { error } = await db()
    .from('leads')
    .update({ ...row, lost_reason_id: row.stage_id !== lead.stage_id ? stageNote.lost_reason_id : lead.lost_reason_id })
    .eq('id', lead.id)
  if (error) throw error
  if (row.stage_id !== lead.stage_id && row.stage_id && !lead.stage_id)
    await logActivity(tenantId, memberId, [lead.id], { kind: 'note', note: 'Added to a funnel', to_stage_id: row.stage_id })
  else if (row.stage_id !== lead.stage_id)
    await logActivity(tenantId, memberId, [lead.id], {
      kind: 'stage',
      from_stage_id: lead.stage_id,
      to_stage_id: row.stage_id,
      note: stageNote.note.trim() || null,
    })
  if ((row.owner_id ?? null) !== (lead.owner_id ?? null))
    await logActivity(tenantId, memberId, [lead.id], { kind: 'assigned', note: null })
}

/** Same change for many leads (bulk bar, board drag). */
export async function updateLeads(ids: string[], patch: Record<string, unknown>) {
  clearLeadsCache()
  const { error } = await db().from('leads').update(patch).in('id', ids)
  if (error) throw error
}

/** deletes leads for good (their follow-ups, activity and form posts go too; bookings keep their details) */
export async function deleteLeads(ids: string[]) {
  clearLeadsCache()
  const { data, error } = await db().from('leads').delete().in('id', ids).select('id')
  if (error) throw error
  if ((data ?? []).length < ids.length) throw new Error('Some leads couldn’t be deleted (no permission).')
}

/** Paid Podcast list (like the old CRM): per lead its last comment, follow-ups done, connected calls, pending follow-up, latest meeting */
export type LeadExtras = {
  lead_id: string
  last_note: string | null
  last_note_at: string | null
  fu_done: number
  connected: number
  pending_fu_id: string | null
  meeting_status: string | null
  meeting_link: string | null
  meeting_date: string | null
  meeting_time: string | null
}
/** last comment, follow-ups done, connected calls and meeting per lead (subId null: every lead the caller can see) */
export async function listLeadExtras(tenantId: string, subId: string | null): Promise<Map<string, LeadExtras>> {
  const { data, error } = await db().rpc('lead_list_extras_v2', { p_tenant: tenantId, p_sub: subId })
  if (error) throw new Error(error.message)
  return new Map(((data ?? []) as LeadExtras[]).map((r) => [r.lead_id, r]))
}

/** Callyzer calls per lead (by the lead's number): total and connected */
export async function listLeadCalls(tenantId: string, leadIds: string[]): Promise<Map<string, { total: number; connected: number }>> {
  const { data, error } = await db().rpc('lead_call_counts', { p_tenant: tenantId, p_leads: leadIds })
  if (error) throw new Error(error.message)
  return new Map(((data ?? []) as { lead_id: string; total: number; connected: number }[]).map((r) => [r.lead_id, { total: r.total, connected: r.connected }]))
}
