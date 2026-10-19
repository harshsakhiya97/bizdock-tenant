import { db } from '@/lib/supabase'
import type { ActivityRow, LeadInput, LeadRow, MemberOption, Option, Temperature } from './types'

const COLS =
  'id, tenant_id, business_id, sub_business_id, funnel_id, stage_id, first_name, last_name, phone, whatsapp, email, city, source_id, referred_by, temperature, estimated_amount, owner_id, tags, notes, next_follow_up_at, lost_reason_id, is_archived, archive_reason, stage_changed_at, created_at, updated_at, landing_page_id, utm_source, utm_medium, utm_campaign, utm_term, utm_content, extra, purpose, required_on, required_hours'

export async function listLeads(tenantId: string): Promise<LeadRow[]> {
  const { data, error } = await db().from('leads').select(COLS).eq('tenant_id', tenantId).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as LeadRow[]
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
  const { error } = await db().from('leads').update(patch).in('id', ids)
  if (error) throw error
}
